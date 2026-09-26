/** Task **documents** — markdown instructions attached to a task, as the wire and the evidence column read them. */

export const TASK_DOCUMENT_SOURCES = ['upload', 'repo'] as const;
export type TaskDocumentSource = (typeof TASK_DOCUMENT_SOURCES)[number];

/** Uploaded / written markdown ceiling. A plan that outgrows it belongs in the repo. */
export const TASK_DOCUMENT_CONTENT_MAX = 200_000;
export const TASK_DOCUMENT_TITLE_MAX = 200;

/** One document as a LIST row — no body, so the list stays light. */
export interface TaskDocumentMeta {
  id: number;
  taskId: number;
  source: TaskDocumentSource;
  title: string;
  /** `repo` only: repo-relative path, forward slashes. */
  repoPath: string | null;
  /** Bytes of the stored text (`upload`), or of the file when last listed (`repo`); null when the file is gone. */
  sizeBytes: number | null;
  createdAt: string;
  createdBy: { id: number; name: string } | null;
}

/** One document with its markdown — `GET /api/tasks/[id]/documents?docId=`. */
export interface TaskDocument extends TaskDocumentMeta {
  /** Null only for a `repo` document whose file no longer exists. */
  content: string | null;
}

export interface TaskDocumentsPayload {
  ok: true;
  documents: TaskDocumentMeta[];
}

export interface TaskDocumentPayload {
  ok: true;
  document: TaskDocument;
}

/** `POST /api/tasks/[id]/documents` body. */
export type TaskDocumentCreateBody =
  | { source: 'upload'; title: string; content: string }
  | { source: 'repo'; path: string };

/** One linkable plan file — `GET /api/tasks/plan-files?q=`. */
export interface PlanFileEntry {
  path: string;
  /** First `# heading`, else the file name. */
  title: string;
  sizeBytes: number;
}

export interface PlanFilesPayload {
  ok: true;
  files: PlanFileEntry[];
}

/** Refusals the document routes return, in words an operator can act on. */
export const TASK_DOCUMENT_REFUSAL_COPY: Readonly<Record<string, string>> = {
  task_not_found: 'That task no longer exists.',
  document_not_found: 'That document is no longer on this task.',
  invalid_path: 'That is not a plan file in this codebase.',
  file_not_found: 'That plan file does not exist.',
  content_too_long: 'That document is too long to attach — link it as a plan file instead.',
  empty_content: 'That document is empty.',
};
