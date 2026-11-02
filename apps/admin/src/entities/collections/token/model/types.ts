// Project roles used to live here too, because token issuance was
// their only consumer. SDL-309 gave them a write surface (the Access
// tab) and they moved to `entities/collections/project-role/`, as the
// note that stood here anticipated.
export type { AccessToken, IssuedToken } from "@/widgets/collections";
