/** HelpdeskProvider — the capability facade for customer-ticket backends ("Integrations as SoT" program, Wave B2). */
import type {
  CreateTicketInput,
  ListTicketsParams,
  PaginatedTickets,
  ZendeskAgent,
  ZendeskComment,
  ZendeskEmailCc,
  ZendeskSupportOverview,
  ZendeskTicket,
  ZendeskUser,
  UpdateTicketInput,
} from '@/lib/zendesk';

/** Raw ticket shape (Zendesk-derived; extra provider keys preserved). */
export type HelpdeskTicket = ZendeskTicket;
/** A ticket-thread comment (public reply or internal note). */
export type HelpdeskComment = ZendeskComment;
/** An assignable helpdesk agent/admin. */
export type HelpdeskAgent = ZendeskAgent;
/** Any helpdesk user (agent or end-user) — resolves comment authors. */
export type HelpdeskUser = ZendeskUser;
/** Dashboard rollup (configured/healthy/count/tickets). */
export type HelpdeskOverview = ZendeskSupportOverview;
/** Create-ticket payload (subject + first comment + routing fields). */
export type CreateHelpdeskTicketInput = CreateTicketInput;
/** Update-ticket patch (fields and/or a new comment). */
export type UpdateHelpdeskTicketInput = UpdateTicketInput;
/** CC collaborator entry added/removed alongside a comment. */
export type HelpdeskEmailCc = ZendeskEmailCc;
/** List pagination/sort params. */
export type ListHelpdeskTicketsParams = ListTicketsParams;
/** Paginated ticket list result. */
export type PaginatedHelpdeskTickets = PaginatedTickets;

/** A comment body posted to a ticket. `uploads` carries attachment tokens from
 *  {@link HelpdeskProvider.uploadAttachment}. `public: false` = internal note. */
export interface HelpdeskCommentInput {
  body: string;
  html_body?: string;
  public?: boolean;
  uploads?: string[];
}

/** One org-bound helpdesk connection. */
export interface HelpdeskProvider {
  /** Vault provider key backing this facade (e.g. 'zendesk'). */
  readonly provider: string;

  /** Per-tenant configured check (vault, dogfood env-fallback included). */
  isConfigured(): Promise<boolean>;

  /** List tickets, newest first by default. */
  listTickets(params?: ListHelpdeskTicketsParams): Promise<PaginatedHelpdeskTickets>;

  /** Free-text ticket search (provider query syntax passes through). */
  searchTickets(
    query: string,
    params?: { page?: number; perPage?: number },
  ): Promise<{ results: HelpdeskTicket[]; count: number; next_page: string | null }>;

  /** Fetch a single ticket. Returns null on 404. */
  getTicket(id: number): Promise<HelpdeskTicket | null>;

  /** Create a ticket. `opts.idempotencyKey` dedupes retried submits. */
  createTicket(
    input: CreateHelpdeskTicketInput,
    opts?: { idempotencyKey?: string },
  ): Promise<HelpdeskTicket>;

  /** Patch a ticket (fields and/or a comment). Returns null on 404. */
  updateTicket(id: number, patch: UpdateHelpdeskTicketInput): Promise<HelpdeskTicket | null>;

  /** Soft-delete a ticket. Returns false on 404. */
  deleteTicket(id: number): Promise<boolean>;

  /** List the comment thread (replies + internal notes). */
  listComments(
    id: number,
    params?: { page?: number; perPage?: number },
  ): Promise<{ comments: HelpdeskComment[]; count: number; next_page: string | null }>;

  /** Add a comment (reply/note); returns the updated ticket or null on 404. */
  addComment(
    id: number,
    comment: HelpdeskCommentInput,
    opts?: { emailCcs?: HelpdeskEmailCc[] },
  ): Promise<HelpdeskTicket | null>;

  /** Upload raw bytes; returns an upload token for `comment.uploads`. */
  uploadAttachment(filename: string, bytes: Uint8Array, contentType?: string): Promise<string>;

  /** Assignable agents/admins (adapter may cache). `force` busts the cache. */
  listAgents(force?: boolean): Promise<HelpdeskAgent[]>;

  /** Resolve user ids to name/email (best-effort). */
  getUsers(ids: number[]): Promise<HelpdeskUser[]>;

  /** Dashboard rollup of open tickets. */
  getOverview(limit?: number): Promise<HelpdeskOverview>;

  /** Deep link to the ticket in the provider's agent UI (null when unknown). */
  ticketUrl(id: string | number | null | undefined): string | null;
}
