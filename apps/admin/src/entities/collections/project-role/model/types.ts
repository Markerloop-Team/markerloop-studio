// Project roles graduated out of `entities/collections/token` in
// SDL-309. They lived there while their only consumer was token
// issuance (a token binds to a consumer role) and the surface was
// read-only; the Access tab gives them a write surface of their own,
// which is exactly the condition the note in the token entity named.
export type { ProjectRole } from "@/widgets/collections";
