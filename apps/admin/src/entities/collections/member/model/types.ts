// Membership is project-scoped state, like roles, and it graduated
// into its own entity for the same reason they did in SDL-309: the
// Access tab writes it. The shape lives with the widget's other
// on-the-wire types — see `ProjectMember` there for why removing a
// member can *widen* what they can read.
export type { MemberUser, ProjectMember } from "@/widgets/collections";
