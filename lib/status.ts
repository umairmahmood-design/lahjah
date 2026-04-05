export type RequestStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "approved"
  | "changes_requested";

export const STATUS_CONFIG: Record<
  RequestStatus,
  { label: string; classes: string }
> = {
  draft: { label: "Draft", classes: "bg-[#F4F5F6] text-ink" },
  submitted: { label: "Submitted for review", classes: "bg-brand text-ink" },
  in_review: { label: "In review", classes: "bg-blue-500 text-white" },
  approved: { label: "Approved", classes: "bg-green-500 text-white" },
  changes_requested: {
    label: "Changes requested",
    classes: "bg-red-500 text-white",
  },
};
