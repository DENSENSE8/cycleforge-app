/** Zendesk integration utility for creating repair service tickets via the Zendesk REST API. */

import {
    getIntegrationCredentials,
    type ZendeskCredentials,
} from '@/lib/integrations/credentials';
import {
    zendeskHttpRequest,
    type ZendeskHttpAuth,
    ZendeskApiError,
    ZendeskRateLimitError,
    ZendeskCircuitOpenError,
} from '@/lib/integrations/helpdesk/zendesk-http';
import type { OrgId } from '@/lib/tenancy/constants';

export { ZendeskApiError, ZendeskRateLimitError, ZendeskCircuitOpenError };

interface RepairTicketData {
    repairServiceId: number;
    repairServiceNumber: string;
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    productTitle: string;
    contactInfo: string;
    issue: string; // Repair reasons
    serialNumber: string;
    price: string;
    notes: string; // Additional notes
}

interface ZendeskAuthConfig {
    subdomain: string;
    user: string;
    apiToken: string;
}

export interface ZendeskSupportTicket {
    id: string;
    subject: string;
    status: string;
    priority: string;
    requesterName: string;
    updatedAt: string;
    url: string;
}

export interface ZendeskSupportOverview {
    configured: boolean;
    healthy: boolean;
    count: number;
    urgentCount: number;
    tickets: ZendeskSupportTicket[];
    agentUrl: string | null;
    error: string | null;
}

function getZendeskAuthConfig(): ZendeskAuthConfig | null {
    const subdomain = process.env.ZENDESK_SUBDOMAIN;
    const user = process.env.ZENDESK_EMAIL || process.env.ZENDESK_API_USER;
    const apiToken = process.env.ZENDESK_API_TOKEN;

    if (!subdomain || !user || !apiToken) {
        return null;
    }

    return { subdomain, user, apiToken };
}

/** Resolve the Zendesk auth config for a tenant. */
async function resolveZendeskAuthConfig(orgId?: OrgId): Promise<ZendeskAuthConfig | null> {
    if (orgId == null) {
        return getZendeskAuthConfig();
    }
    const creds = await getIntegrationCredentials<ZendeskCredentials>(orgId, 'zendesk');
    if (!creds || !creds.subdomain || !creds.email || !creds.apiToken) {
        return null;
    }
    return { subdomain: creds.subdomain, user: creds.email, apiToken: creds.apiToken };
}

async function zendeskRequest(config: ZendeskAuthConfig, path: string, orgId?: OrgId): Promise<any> {
    return zendeskHttpRequest(config, 'GET', path, {}, orgId);
}

export async function getZendeskSupportOverview(limit = 10, orgId?: OrgId): Promise<ZendeskSupportOverview> {
    const config = await resolveZendeskAuthConfig(orgId);
    // Derive the agent URL from the resolved tenant subdomain. Only fall back to
    // env (legacy USAV single-tenant) when no orgId was supplied; a non-USAV org
    // that isn't configured gets a null agentUrl rather than a link to USAV's.
    const agentSubdomain = config?.subdomain ?? (orgId == null ? process.env.ZENDESK_SUBDOMAIN : undefined);
    const agentUrl = agentSubdomain ? `https://${agentSubdomain}.zendesk.com/agent/filters` : null;

    if (!config) {
        return {
            configured: false,
            healthy: false,
            count: 0,
            urgentCount: 0,
            tickets: [],
            agentUrl,
            error: 'Zendesk API credentials are not configured',
        };
    }

    try {
        const encodedQuery = encodeURIComponent('type:ticket status<solved');
        const data = await zendeskRequest(
            config,
            `/api/v2/search.json?query=${encodedQuery}&sort_by=updated_at&sort_order=desc`,
            orgId,
        );

        const results = Array.isArray(data?.results) ? data.results : [];
        const tickets = results
            .filter((entry: any) => String(entry?.result_type || 'ticket') === 'ticket')
            .slice(0, limit)
            .map((entry: any) => ({
                id: String(entry?.id || ''),
                subject: String(entry?.subject || 'Zendesk ticket'),
                status: String(entry?.status || 'open'),
                priority: String(entry?.priority || 'normal'),
                requesterName: String(entry?.requester?.name || entry?.via?.source?.from?.name || 'Customer'),
                updatedAt: String(entry?.updated_at || ''),
                url: `https://${config.subdomain}.zendesk.com/agent/tickets/${encodeURIComponent(String(entry?.id || ''))}`,
            }));

        const urgentCount = tickets.filter((ticket: ZendeskSupportTicket) => ['urgent', 'high'].includes(ticket.priority.toLowerCase())).length;
        const count = Number.isFinite(Number(data?.count)) ? Number(data.count) : tickets.length;

        return {
            configured: true,
            healthy: true,
            count,
            urgentCount,
            tickets,
            agentUrl,
            error: null,
        };
    } catch (error: any) {
        console.error('Zendesk support overview failed:', error);

        return {
            configured: true,
            healthy: false,
            count: 0,
            urgentCount: 0,
            tickets: [],
            agentUrl,
            error: error?.message || 'Failed to load Zendesk tickets',
        };
    }
}

/**
 * Returns a Date that is `businessDays` business days (Mon-Fri) from startDate.
 * Exported so callers can derive a deadline_at value independently of Zendesk.
 */
export function addBusinessDays(startDate: Date, businessDays = 5): Date {
    const date = new Date(startDate);
    let added = 0;
    while (added < businessDays) {
        date.setDate(date.getDate() + 1);
        const dow = date.getDay();
        if (dow !== 0 && dow !== 6) added++;
    }
    return date;
}

/** Returns the repair due date as a MM/DD/YYYY string for display in tickets. */
function calculateDueDate(startDate: Date): string {
    const date = addBusinessDays(startDate, 5);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}/${day}/${date.getFullYear()}`;
}

/**
 * Create a Zendesk repair-service ticket directly via the REST API.
 * Returns the ticket number formatted as `#<id>` (e.g. `#12345`).
 * Throws ZendeskNotConfiguredError / ZendeskApiError on failure.
 */
export async function createZendeskTicket(
    data: RepairTicketData,
    opts: { idempotencyKey?: string } = {},
    orgId?: OrgId,
): Promise<string | null> {
    const {
        repairServiceId,
        repairServiceNumber,
        customerName,
        customerPhone,
        customerEmail,
        productTitle,
        contactInfo,
        issue,
        serialNumber,
        price,
        notes
    } = data;

    // 1. Validate required fields (email is optional)
    if (!customerName || !customerPhone || !productTitle || !serialNumber || !price) {
        const missing = [];
        if (!customerName) missing.push('Name');
        if (!customerPhone) missing.push('Phone number');
        if (!productTitle) missing.push('Product Title');
        if (!serialNumber) missing.push('Serial #');
        if (!price) missing.push('Price');

        throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    // 2. Calculate due date
    const dueDate = calculateDueDate(new Date());

    // 3. Build description — clean, human-readable layout.
    const descriptionLines = [
        `Repair Service ${repairServiceNumber} (ID ${repairServiceId})`,
        '',
        `Product: ${productTitle}`,
        `Serial Number: ${serialNumber}`,
        `Reported Issue: ${issue}`,
        '',
        `Customer Contact: ${contactInfo}`,
        `Estimated Due Date: ${dueDate}`,
    ];

    // Add notes at the end if present
    if (notes) {
        descriptionLines.push('', 'Additional Notes:', notes);
    }
    const description = descriptionLines.join('\n');

    // 4. Create the ticket directly via the Zendesk REST API.
    const ticket = await createTicket({
        subject: `Repair RS ${repairServiceId}: Walk-in ${customerName} - ${customerPhone} - Due Date: ${dueDate}`,
        comment: { body: description, public: false },
        type: 'task',
        tags: ['repair_service', 'walk_in'],
        external_id: `repair:${repairServiceId}`,
        ...(customerEmail ? { requester: { name: customerName, email: customerEmail } } : {}),
    }, opts, orgId);

    return `#${ticket.id}`;
}

/* ──────────────────────────────────────────────────────────────────────── Direct Zendesk REST API client (tickets CRUD + comments) */

/** Thrown when the Zendesk API credentials are not configured. Routes map this to 503. */
export class ZendeskNotConfiguredError extends Error {
    constructor(message = 'Zendesk API credentials are not configured') {
        super(message);
        this.name = 'ZendeskNotConfiguredError';
    }
}

/**
 * Synchronous env-only configured check. Kept sync (and env-only) for
 * backward-compatible callers. For a per-tenant check, await
 * isZendeskConfiguredForOrg(orgId).
 */
export function isZendeskConfigured(): boolean {
    return getZendeskAuthConfig() !== null;
}

/** Per-tenant configured check (vault, USAV env-fallback). */
export async function isZendeskConfiguredForOrg(orgId?: OrgId): Promise<boolean> {
    return (await resolveZendeskAuthConfig(orgId)) !== null;
}

async function requireZendeskConfig(orgId?: OrgId): Promise<ZendeskHttpAuth> {
    const config = await resolveZendeskAuthConfig(orgId);
    if (!config) throw new ZendeskNotConfiguredError();
    return config;
}

/** Generalized Zendesk REST call: any method, optional JSON body, typed result. */
async function zendeskApiRequest<T = any>(
    path: string,
    init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
    orgId?: OrgId,
): Promise<T> {
    const config = await requireZendeskConfig(orgId);
    const method = (init.method ?? 'GET').toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE';
    return zendeskHttpRequest<T>(
        config,
        method,
        path,
        { body: init.body, headers: init.headers },
        orgId,
    );
}

export type ZendeskTicketStatus = 'new' | 'open' | 'pending' | 'hold' | 'solved' | 'closed';
export type ZendeskTicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ZendeskTicketType = 'problem' | 'incident' | 'question' | 'task';

/** Raw Zendesk ticket object (subset of fields we rely on; extra keys preserved). */
export interface ZendeskTicket {
    id: number;
    subject: string | null;
    description?: string | null;
    raw_subject?: string | null;
    status: ZendeskTicketStatus | string;
    priority: ZendeskTicketPriority | string | null;
    type?: ZendeskTicketType | string | null;
    requester_id?: number;
    assignee_id?: number | null;
    group_id?: number | null;
    tags?: string[];
    external_id?: string | null;
    created_at: string;
    updated_at: string;
    url?: string;
    [key: string]: unknown;
}

export interface ZendeskComment {
    id: number;
    author_id: number;
    body: string;
    html_body?: string;
    public: boolean;
    created_at: string;
    [key: string]: unknown;
}

export interface ListTicketsParams {
    page?: number;
    perPage?: number;
    sortBy?: 'created_at' | 'updated_at' | 'priority' | 'status' | 'id';
    sortOrder?: 'asc' | 'desc';
}

export interface PaginatedTickets {
    tickets: ZendeskTicket[];
    count: number;
    next_page: string | null;
    previous_page: string | null;
}

function clampPage(page?: number): number {
    return Math.max(1, Math.floor(Number(page) || 1));
}
function clampPerPage(perPage?: number): number {
    return Math.min(100, Math.max(1, Math.floor(Number(perPage) || 25)));
}

/** List tickets, newest first by default. */
export async function listTickets(params: ListTicketsParams = {}, orgId?: OrgId): Promise<PaginatedTickets> {
    const qs = new URLSearchParams({
        page: String(clampPage(params.page)),
        per_page: String(clampPerPage(params.perPage)),
        sort_by: params.sortBy ?? 'created_at',
        sort_order: params.sortOrder ?? 'desc',
    });
    const data = await zendeskApiRequest<any>(`/api/v2/tickets.json?${qs.toString()}`, {}, orgId);
    return {
        tickets: Array.isArray(data?.tickets) ? data.tickets : [],
        count: Number.isFinite(Number(data?.count)) ? Number(data.count) : 0,
        next_page: data?.next_page ?? null,
        previous_page: data?.previous_page ?? null,
    };
}

/** Search tickets via the Zendesk Search API. `type:ticket` is added if absent. */
export async function searchTickets(
    query: string,
    params: { page?: number; perPage?: number } = {},
    orgId?: OrgId,
): Promise<{ results: ZendeskTicket[]; count: number; next_page: string | null }> {
    const fullQuery = /\btype:/.test(query) ? query : `type:ticket ${query}`.trim();
    const qs = new URLSearchParams({
        query: fullQuery,
        sort_by: 'updated_at',
        sort_order: 'desc',
        page: String(clampPage(params.page)),
        per_page: String(clampPerPage(params.perPage)),
    });
    const data = await zendeskApiRequest<any>(`/api/v2/search.json?${qs.toString()}`, {}, orgId);
    const results = (Array.isArray(data?.results) ? data.results : []).filter(
        (r: any) => String(r?.result_type || 'ticket') === 'ticket',
    );
    return {
        results,
        count: Number.isFinite(Number(data?.count)) ? Number(data.count) : results.length,
        next_page: data?.next_page ?? null,
    };
}

/** Fetch a single ticket. Returns null on 404. */
export async function getTicket(id: number, orgId?: OrgId): Promise<ZendeskTicket | null> {
    try {
        const data = await zendeskApiRequest<any>(`/api/v2/tickets/${id}.json`, {}, orgId);
        return data?.ticket ?? null;
    } catch (err) {
        if (err instanceof ZendeskApiError && err.status === 404) return null;
        throw err;
    }
}

export interface CreateTicketInput {
    subject: string;
    // `uploads` carries upload tokens from uploadFileToZendesk() — Zendesk turns
    // each into a file attachment on this comment.
    comment: { body: string; html_body?: string; public?: boolean; uploads?: string[] };
    priority?: ZendeskTicketPriority;
    status?: ZendeskTicketStatus;
    type?: ZendeskTicketType;
    tags?: string[];
    requester?: { name?: string; email?: string };
    assignee_id?: number;
    group_id?: number;
    external_id?: string;
    /**
     * CC collaborators to add at ticket creation (see {@link ZendeskEmailCc}).
     * Zendesk only emails CCs on a PUBLIC comment, so pair this with
     * `comment.public: true` when you want the recipients notified.
     */
    email_ccs?: ZendeskEmailCc[];
}

/** Create a ticket directly via the REST API. */
/** Upload one file to Zendesk's Uploads API and return its upload token. */
export async function uploadFileToZendesk(
    filename: string,
    bytes: Uint8Array,
    contentType = 'application/octet-stream',
    orgId?: OrgId,
): Promise<string> {
    const config = await requireZendeskConfig(orgId);
    const data = (await zendeskHttpRequest<{ upload?: { token?: string } }>(
        config,
        'POST',
        `/api/v2/uploads.json?filename=${encodeURIComponent(filename)}`,
        { rawBody: bytes, contentType },
        orgId,
    )) as { upload?: { token?: string } };
    const token = data.upload?.token;
    if (!token) throw new ZendeskApiError(502, 'Zendesk upload returned no token');
    return token;
}

export async function createTicket(
    input: CreateTicketInput,
    opts: { idempotencyKey?: string } = {},
    orgId?: OrgId,
): Promise<ZendeskTicket> {
    const data = await zendeskApiRequest<any>(`/api/v2/tickets.json`, {
        method: 'POST',
        body: { ticket: input },
        headers: opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : undefined,
    }, orgId);
    return data.ticket;
}

/**
 * A CC collaborator on a ticket. Zendesk's CCs/followers framework takes an
 * `email_ccs` array on the ticket update; `action: 'put'` adds, `'delete'` removes.
 */
export interface ZendeskEmailCc {
    user_email: string;
    user_name?: string;
    action?: 'put' | 'delete';
}

export interface UpdateTicketInput {
    subject?: string;
    /**
     * Adding a comment is how Zendesk records ticket replies / internal notes.
     * `uploads` carries upload tokens from uploadFileToZendesk() so a reply can
     * ride file attachments — same contract as CreateTicketInput.comment.
     */
    comment?: { body: string; html_body?: string; public?: boolean; uploads?: string[] };
    priority?: ZendeskTicketPriority;
    status?: ZendeskTicketStatus;
    type?: ZendeskTicketType;
    tags?: string[];
    assignee_id?: number | null;
    group_id?: number | null;
    external_id?: string | null;
    /** CC collaborators added/removed alongside a comment (top-level ticket field). */
    email_ccs?: ZendeskEmailCc[];
}

/** Update a ticket. Returns null on 404. */
export async function updateTicket(
    id: number,
    input: UpdateTicketInput,
    orgId?: OrgId,
): Promise<ZendeskTicket | null> {
    try {
        const data = await zendeskApiRequest<any>(`/api/v2/tickets/${id}.json`, {
            method: 'PUT',
            body: { ticket: input },
        }, orgId);
        return data?.ticket ?? null;
    } catch (err) {
        if (err instanceof ZendeskApiError && err.status === 404) return null;
        throw err;
    }
}

/** Soft-delete a ticket (Zendesk moves it to the deleted tickets view). Returns false on 404. */
export async function deleteTicket(id: number, orgId?: OrgId): Promise<boolean> {
    try {
        await zendeskApiRequest<void>(`/api/v2/tickets/${id}.json`, { method: 'DELETE' }, orgId);
        return true;
    } catch (err) {
        if (err instanceof ZendeskApiError && err.status === 404) return false;
        throw err;
    }
}

/** List the comment thread (public replies + internal notes) for a ticket. */
export async function listTicketComments(
    id: number,
    params: { page?: number; perPage?: number } = {},
    orgId?: OrgId,
): Promise<{ comments: ZendeskComment[]; count: number; next_page: string | null }> {
    const qs = new URLSearchParams({
        page: String(clampPage(params.page)),
        per_page: String(clampPerPage(params.perPage)),
    });
    const data = await zendeskApiRequest<any>(
        `/api/v2/tickets/${id}/comments.json?${qs.toString()}`,
        {},
        orgId,
    );
    return {
        comments: Array.isArray(data?.comments) ? data.comments : [],
        count: Number.isFinite(Number(data?.count)) ? Number(data.count) : 0,
        next_page: data?.next_page ?? null,
    };
}

/**
 * Add a comment to a ticket. In Zendesk a comment is applied via a ticket
 * update, so this returns the updated ticket (or null if the ticket is gone).
 * `public: false` posts an internal note.
 */
export async function addTicketComment(
    id: number,
    comment: { body: string; html_body?: string; public?: boolean; uploads?: string[] },
    opts: { emailCcs?: ZendeskEmailCc[] } = {},
    orgId?: OrgId,
): Promise<ZendeskTicket | null> {
    const emailCcs = opts.emailCcs?.filter((cc) => cc.user_email?.trim());
    return updateTicket(id, {
        comment,
        ...(emailCcs?.length ? { email_ccs: emailCcs } : {}),
    }, orgId);
}

export interface ZendeskAgent {
    id: number;
    name: string;
    email: string | null;
    role: string;
    photo: string | null;
}

/**
 * List agents + admins (the people a ticket can be assigned to). Powers the
 * assignee dropdown. Cached in-process for 5 min — the roster rarely changes.
 */
let agentCache: { at: number; agents: ZendeskAgent[]; scope: OrgId | '__env__' } | null = null;
const AGENT_CACHE_MS = 5 * 60 * 1000;

export async function listAgents(force = false, orgId?: OrgId): Promise<ZendeskAgent[]> {
    await requireZendeskConfig(orgId);
    const now = Date.now();
    // Cache is scoped per-tenant so one org's roster can't be served to another.
    const cacheScope = orgId ?? '__env__';
    if (!force && agentCache && agentCache.scope === cacheScope && now - agentCache.at < AGENT_CACHE_MS) {
        return agentCache.agents;
    }
    // role[]=agent&role[]=admin returns assignable staff only.
    const data = await zendeskApiRequest<any>(
        `/api/v2/users.json?role[]=agent&role[]=admin&per_page=100`,
        {},
        orgId,
    );
    const agents: ZendeskAgent[] = (Array.isArray(data?.users) ? data.users : []).map(
        (u: any) => ({
            id: Number(u?.id),
            name: String(u?.name || 'Agent'),
            email: u?.email ?? null,
            role: String(u?.role || 'agent'),
            photo: u?.photo?.content_url ?? null,
        }),
    );
    agentCache = { at: now, agents, scope: cacheScope };
    return agents;
}

/** A Zendesk user (any role) — used to resolve a comment author to a real name/email. */
export interface ZendeskUser {
    id: number;
    name: string;
    email: string | null;
    role: string;
    photo: string | null;
}

/** Resolve a set of Zendesk user ids to their name/email via the show_many API. */
export async function getUsers(ids: number[], orgId?: OrgId): Promise<ZendeskUser[]> {
    await requireZendeskConfig(orgId);
    const unique = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
    if (!unique.length) return [];

    const out: ZendeskUser[] = [];
    for (let i = 0; i < unique.length; i += 100) {
        const chunk = unique.slice(i, i + 100);
        const data = await zendeskApiRequest<any>(
            `/api/v2/users/show_many.json?ids=${chunk.join(',')}`,
            {},
            orgId,
        );
        for (const u of Array.isArray(data?.users) ? data.users : []) {
            out.push({
                id: Number(u?.id),
                name: String(u?.name || 'User'),
                email: u?.email ?? null,
                role: String(u?.role || 'end-user'),
                photo: u?.photo?.content_url ?? null,
            });
        }
    }
    return out;
}
