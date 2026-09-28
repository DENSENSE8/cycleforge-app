import { z } from 'zod';
import { eBayApi } from 'ebay-api';
import pool from '@/lib/db';
import { logger } from '@/lib/observability/logger';
import { refreshEbayAccessToken } from './token-refresh';
import { getEbayAppCreds, EBAY_PLATFORM_PREDICATE, type EbayAppCreds } from './credentials';
import {
  ebayScopeStringForRole,
  isEbaySandbox,
  normalizeEbayRole,
  type EbayAccountRole,
} from './oauth-config';
import { tenantQuery } from '@/lib/tenancy/db';

/** eBay API Client Handles authentication, token management, and API calls for a specific eBay account */
export class EbayClient {
  private api: eBayApi | null = null;
  private accountName: string;
  private sandbox = false;
  private orgId: string | null = null;
  private creds: EbayAppCreds | null = null;
  /** Cached from ebay_accounts — drives role-matched refresh scopes. */
  private accountRole: EbayAccountRole | null = null;

  constructor(accountName: string, orgId?: string) {
    this.accountName = accountName;
    // Prefer an explicit org — account_name is only unique PER ORG now, so a
    // name-only lookup (getOrganizationId fallback) is ambiguous across tenants.
    this.orgId = orgId ?? null;
  }

  /** Resolve + cache this account's org and eBay app credentials. */
  private async ensureCreds(): Promise<EbayAppCreds> {
    if (this.creds) return this.creds;
    const orgId = await this.getOrganizationId();
    const creds = await getEbayAppCreds(orgId);
    if (!creds) {
      throw new Error(`No eBay app credentials configured for organization ${orgId}`);
    }
    this.creds = creds;
    this.sandbox = isEbaySandbox(creds.environment);
    return creds;
  }

  /** Lazily build the ebay-api client from the resolved credentials. */
  private async ensureApi(): Promise<eBayApi> {
    if (this.api) return this.api;
    const creds = await this.ensureCreds();
    this.api = new eBayApi({
      appId: creds.appId,
      certId: creds.certId,
      sandbox: this.sandbox,
      siteId: 0, // EBAY_US
      marketplaceId: 'EBAY_US',
      acceptLanguage: 'en-US',
      contentLanguage: 'en-US',
      ruName: creds.ruName,
    });
    return this.api;
  }

  private async getOrganizationId(): Promise<string> {
    if (this.orgId) return this.orgId;
    // RLS bypass lookup via pool (raw connection without GUC)
    const result = await pool.query(
      `SELECT organization_id FROM ebay_accounts
        WHERE account_name = $1 AND ${EBAY_PLATFORM_PREDICATE}`,
      [this.accountName]
    );
    if (!result.rows[0]) {
      throw new Error(`eBay account ${this.accountName} not found in database`);
    }
    this.orgId = result.rows[0].organization_id;
    return this.orgId!;
  }

  private async auditCall<T>(
    method: string,
    endpoint: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    let statusCode = 200;
    let errorMessage: string | null = null;

    try {
      const result = await fn();
      const latencyMs = Date.now() - startTime;
      
      this.logAuditCall(method, endpoint, latencyMs, statusCode, null).catch((err) => {
        console.error(`[${this.accountName}] Failed to save audit log:`, err.message);
      });

      return result;
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      statusCode = error.status || error.statusCode || error.meta?.status || error.response?.status || 500;
      errorMessage = error.message || String(error);

      this.logAuditCall(method, endpoint, latencyMs, statusCode, errorMessage).catch((err) => {
        console.error(`[${this.accountName}] Failed to save audit log (on error):`, err.message);
      });

      throw error;
    }
  }

  private async logAuditCall(
    method: string,
    endpoint: string,
    latencyMs: number,
    statusCode: number,
    errorMessage: string | null
  ): Promise<void> {
    try {
      const orgId = await this.getOrganizationId();
      await tenantQuery(
        orgId,
        `INSERT INTO ebay_api_calls (organization_id, method, endpoint, latency_ms, status_code, error_message, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [orgId, method, endpoint, latencyMs, statusCode, errorMessage]
      );
    } catch (err: any) {
      console.error(`[${this.accountName}] Failed to write audit call to database:`, err.message);
    }
  }

  private async withOAuthCredentials<T>(callback: (api: eBayApi) => Promise<T>): Promise<T> {
    const api = await this.ensureApi();
    const { accessToken, refreshToken } = await this.getValidAccessToken();

    api.oAuth2.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 7200,
      refresh_token_expires_in: 0,
      token_type: 'User Access Token'
    });

    return callback(api);
  }

  private getArrayCandidate(payload: any, keys: string[]): any[] {
    for (const key of keys) {
      if (Array.isArray(payload?.[key])) {
        return payload[key];
      }
    }

    return [];
  }

  private isActiveReturnState(state: string): boolean {
    const normalized = String(state || '').trim().toUpperCase();
    if (!normalized) return true;

    return ![
      'CLOSED',
      'CLOSE',
      'COMPLETED',
      'COMPLETE',
      'RESOLVED',
      'REFUNDED',
      'CANCELLED',
      'CANCELED',
    ].includes(normalized);
  }

  /**
   * Resolve + cache this account's seller|buyer role for role-matched refresh.
   * Buyer tokens refreshed with seller scopes silently downgrade — never default.
   */
  private async getAccountRole(): Promise<EbayAccountRole> {
    if (this.accountRole) return this.accountRole;
    const orgId = await this.getOrganizationId();
    const result = await tenantQuery<{ account_role: string | null }>(
      orgId,
      `SELECT account_role FROM ebay_accounts
        WHERE account_name = $1 AND organization_id = $2 AND ${EBAY_PLATFORM_PREDICATE}
        LIMIT 1`,
      [this.accountName, orgId],
    );
    if (!result.rows[0]) {
      throw new Error(`eBay account ${this.accountName} not found in database`);
    }
    this.accountRole = normalizeEbayRole(result.rows[0].account_role);
    return this.accountRole;
  }

  /**
   * Get a valid access token for the account
   * Automatically refreshes if expired or about to expire
   * Returns both access token and refresh token (decrypted)
   */
  async getValidAccessToken(): Promise<{ accessToken: string; refreshToken: string }> {
    const orgId = await this.getOrganizationId();
    const { resolveEbayUserTokens } = await import('@/lib/ebay/credentials');
    const tokens = await resolveEbayUserTokens(orgId, this.accountName, this.accountRole);
    this.accountRole = tokens.accountRole;

    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (tokens.tokenExpiresAt < fiveMinutesFromNow || !tokens.accessToken) {
      logger.info(`[${this.accountName}] Access token expired or expiring soon, refreshing...`);
      const newAccessToken = await this.refreshAccessToken(tokens.refreshToken);
      return { accessToken: newAccessToken, refreshToken: tokens.refreshToken };
    }

    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  /**
   * Refresh the access token using the refresh token
   * Uses direct HTTP call to eBay OAuth2 endpoint (more reliable)
   */
  async refreshAccessToken(refreshToken: string): Promise<string> {
    try {
      logger.info(`[${this.accountName}] Refreshing access token...`);

      const creds = await this.ensureCreds();
      const role = await this.getAccountRole();
      const { accessToken, expiresIn } = await refreshEbayAccessToken(
        creds.appId,
        creds.certId,
        refreshToken,
        creds.environment,
        ebayScopeStringForRole(role),
      );

      const newExpiresAt = new Date(Date.now() + expiresIn * 1000);
      const orgId = await this.getOrganizationId();
      const { patchEbayUserAccessToken, touchEbayAccountTokenExpiry } = await import(
        '@/lib/ebay/credentials'
      );
      await patchEbayUserAccessToken({
        orgId,
        role,
        accountName: this.accountName,
        accessToken,
        expiresAt: newExpiresAt,
      });
      await touchEbayAccountTokenExpiry(orgId, this.accountName, newExpiresAt);

      logger.info(
        `[${this.accountName}] Access token refreshed successfully (role=${role}, expires in ${expiresIn}s)`,
      );
      return accessToken;
    } catch (error: any) {
      console.error(`[${this.accountName}] Failed to refresh access token:`, error.message);
      throw new Error(`Failed to refresh access token for ${this.accountName}: ${error.message}`);
    }
  }

  /**
   * Fetch orders from eBay Fulfillment API
   */
  async fetchOrders(options: { 
    lastModifiedDate?: string; 
    limit?: number;
    offset?: number;
  } = {}): Promise<any[]> {
    try {
      return this.withOAuthCredentials(async (api) => {
        const params: any = {
          limit: options.limit || 100,
        };

        if (options.offset) {
          params.offset = options.offset;
        }

        // Add filter for orders modified since last sync
        if (options.lastModifiedDate) {
          params.filter = `lastmodifieddate:[${options.lastModifiedDate}..]`;
        }

        logger.info({ params }, `[${this.accountName}] Fetching orders with params`);

        return this.auditCall('GET', '/sell/fulfillment/v1/order', async () => {
          const response = await api.sell.fulfillment.getOrders(params);
          const orders = response.orders || [];
          logger.info(`[${this.accountName}] Fetched ${orders.length} orders`);
          return orders;
        });
      });
    } catch (error: any) {
      console.error(`[${this.accountName}] Error fetching orders:`, error.message);
      throw new Error(`Failed to fetch orders for ${this.accountName}: ${error.message}`);
    }
  }

  /**
   * Get order details by order ID
   */
  async getOrderDetails(orderId: string): Promise<any> {
    try {
      return this.withOAuthCredentials(async (api) =>
        this.auditCall('GET', `/sell/fulfillment/v1/order/${orderId}`, async () =>
          api.sell.fulfillment.getOrder(orderId)
        )
      );
    } catch (error: any) {
      console.error(`[${this.accountName}] Error fetching order ${orderId}:`, error.message);
      throw new Error(`Failed to fetch order ${orderId} for ${this.accountName}: ${error.message}`);
    }
  }

  async fetchUnreadMessages(limit = 10): Promise<any[]> {
    try {
      return this.withOAuthCredentials(async (api) => {
        return this.auditCall('GET', '/commerce/message/v1/conversation', async () => {
          const response = await api.commerce.message.getConversations({
            limit: Math.max(1, Math.min(limit, 50)),
            offset: 0,
          });

          const conversations = Array.isArray(response?.conversations) ? response.conversations : [];

          return conversations
            .filter((conversation: any) => Number(conversation?.unreadCount || 0) > 0)
            .sort((a: any, b: any) => {
              const aTime = new Date(a?.latestMessage?.createdDate || a?.createdDate || 0).getTime();
              const bTime = new Date(b?.latestMessage?.createdDate || b?.createdDate || 0).getTime();
              return bTime - aTime;
            })
            .slice(0, limit)
            .map((conversation: any) => ({
              conversationId: String(conversation?.conversationId || ''),
              subject: String(
                conversation?.latestMessage?.subject ||
                  conversation?.conversationTitle ||
                  conversation?.referenceId ||
                  'eBay conversation'
              ),
              otherPartyUsername: String(
                conversation?.latestMessage?.senderUsername ||
                  conversation?.latestMessage?.recipientUsername ||
                  'Buyer'
              ),
              unreadCount: Number(conversation?.unreadCount || 0),
              referenceId: String(conversation?.referenceId || ''),
              referenceType: String(conversation?.referenceType || ''),
              createdDate: String(conversation?.latestMessage?.createdDate || conversation?.createdDate || ''),
              conversationStatus: String(conversation?.conversationStatus || ''),
              conversationType: String(conversation?.conversationType || ''),
            }));
        });
      });
    } catch (error: any) {
      console.error(`[${this.accountName}] Error fetching unread messages:`, error.message);
      throw new Error(`Failed to fetch unread messages for ${this.accountName}: ${error.message}`);
    }
  }

  async fetchOpenReturns(limit = 10): Promise<any[]> {
    try {
      return this.withOAuthCredentials(async (api) => {
        return this.auditCall('GET', '/post-order/v2/return/search', async () => {
          const response = await api.postOrder.return.search({
            limit: Math.max(1, Math.min(limit * 3, 50)),
            offset: 0,
            role: 'SELLER',
          });

          const returns = this.getArrayCandidate(response, ['returns', 'members', 'items', 'returnRequests']);

          return returns
            .filter((entry: any) =>
              this.isActiveReturnState(
                String(
                  entry?.returnState ||
                    entry?.state ||
                    entry?.status ||
                    entry?.returnStatus ||
                    ''
                )
              )
            )
            .slice(0, limit)
            .map((entry: any) => ({
              returnId: String(entry?.returnId || entry?.id || ''),
              orderId: String(entry?.orderId || entry?.order?.orderId || ''),
              itemId: String(entry?.itemId || entry?.item?.itemId || ''),
              state: String(
                entry?.returnState ||
                  entry?.state ||
                  entry?.status ||
                  entry?.returnStatus ||
                  'OPEN'
              ),
              creationDate: String(
                entry?.creationDate ||
                  entry?.creationDateValue ||
                  entry?.creationDateTime ||
                  entry?.lastModifiedDate ||
                  ''
              ),
              lastModifiedDate: String(entry?.lastModifiedDate || entry?.creationDate || ''),
            }));
        });
      });
    } catch (error: any) {
      console.error(`[${this.accountName}] Error fetching return requests:`, error.message);
      throw new Error(`Failed to fetch return requests for ${this.accountName}: ${error.message}`);
    }
  }

  /**
   * Get all shipping fulfillments for an order.
   * Tracking is returned in fulfillments[].shipmentTrackingNumber when available.
   */
  async getOrderShippingFulfillments(orderId: string): Promise<any[]> {
    try {
      await this.ensureCreds(); // resolves this.sandbox for the apiBase below
      const { accessToken } = await this.getValidAccessToken();
      const apiBase = this.sandbox ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
      const url = `${apiBase}/sell/fulfillment/v1/order/${encodeURIComponent(orderId)}/shipping_fulfillment`;

      return this.auditCall('GET', `/sell/fulfillment/v1/order/${orderId}/shipping_fulfillment`, async () => {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          const error: any = new Error(`Failed to fetch shipping fulfillments (${response.status}): ${text}`);
          error.status = response.status;
          throw error;
        }

        const data = await response.json().catch(() => ({}));
        return Array.isArray(data?.fulfillments) ? data.fulfillments : [];
      });
    } catch (error: any) {
      console.error(`[${this.accountName}] Error fetching shipping fulfillments for order ${orderId}:`, error.message);
      throw new Error(`Failed to fetch shipping fulfillments for ${orderId}: ${error.message}`);
    }
  }

  /**
   * One page of the seller's ACTIVE listings (Trading GetMyeBaySelling
   * ActiveList) — every listing, Inventory-API or not. The chat's eBay product
   * import (SIMPLE-FIRST) pages through it into the catalog.
   */
  async fetchActiveListingsPage(
    page = 1,
    perPage = 200,
  ): Promise<{ listings: Array<{ itemId: string; title: string; sku: string | null; imageUrl: string | null }>; totalPages: number }> {
    return this.withOAuthCredentials(async (api) =>
      this.auditCall('POST', '/ws/api.dll GetMyeBaySelling', async () => {
        const res: unknown = await api.trading.GetMyeBaySelling({
          ActiveList: { Include: true, Pagination: { EntriesPerPage: Math.min(Math.max(perPage, 1), 200), PageNumber: page } },
        });
        const parsed = ActiveListResponse.parse(res ?? {});
        const raw = parsed.ActiveList?.ItemArray?.Item;
        const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
        return {
          listings: items
            .map((item) => ({
              itemId: String(item.ItemID ?? '').trim(),
              title: String(item.Title ?? '').trim(),
              sku: item.SKU != null ? String(item.SKU).trim() || null : null,
              imageUrl: item.PictureDetails?.GalleryURL ?? null,
            }))
            .filter((l) => l.itemId && l.title),
          totalPages: Math.max(1, Number(parsed.ActiveList?.PaginationResult?.TotalNumberOfPages) || 1),
        };
      }),
    );
  }
}

/** The slice of a Trading GetMyeBaySelling response the product import reads (eBay's XML → JSON; a lone Item is not an array). */
const ActiveListItem = z
  .object({
    ItemID: z.union([z.string(), z.number()]).optional(),
    Title: z.union([z.string(), z.number()]).optional(),
    SKU: z.union([z.string(), z.number()]).optional(),
    PictureDetails: z.object({ GalleryURL: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();
const ActiveListResponse = z
  .object({
    ActiveList: z
      .object({
        ItemArray: z.object({ Item: z.union([z.array(ActiveListItem), ActiveListItem]).optional() }).passthrough().optional(),
        PaginationResult: z.object({ TotalNumberOfPages: z.union([z.string(), z.number()]).optional() }).passthrough().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

