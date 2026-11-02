export type {
  SaunaId,
  SaunaSchemaVersion,
  SaunaSchema,
  SaunaSchemaV1,
  SaunaSchemaV2,
  SaunaAnySchema,
  SaunaNodeId,
  SaunaNodeConfig,
  SaunaParamSpec,
  SaunaParamType,
  VariantSpec,
  VisibilityRule,
  VisibilityCondition,
  SaunaVisibilityMode,
  SaunaNodeVisibility,
  SaunaScreen,
  SaunaMemberBranch,
  SaunaScreenOverrides,
  SaunaJSONPrimitive,
  SaunaPageBehaviorSlot,
} from "./schema/types";
export {
  SAUNA_DOCUMENT_BEHAVIOR_KEYS,
  SAUNA_NODE_BEHAVIOR_KEYS,
  SAUNA_PARAM_TYPES,
  SAUNA_DEFAULT_PARAM_TYPE,
  SAUNA_PARAM_NAME_MAX,
} from "./schema/types";
export {
  isSaunaParamType,
  saunaParamType,
  saunaParamSpecIssues,
  findParamSpecIssues,
  type SaunaParamIssue,
} from "./schema/params";

export { evaluateVisibility, evaluateCondition, resolvePath, saunaAudience } from "./react/visibility";
export type { SaunaAudience } from "./react/types";
export { resolveNodeBody, type ResolvedNodeBody, type ResolveNodeBodyOptions } from "./react/variants";

export {
  validateSaunaSchema,
  findUnsafeSchemaProps,
  type SaunaValidationMode,
  type SaunaValidationError,
  type SaunaValidationIssue,
  type SaunaValidationResult,
} from "./schema/validate";

export type {
  SaunaParamWarning,
  SaunaParamWarningCode,
} from "./core/param-warnings";

export { migrateSaunaSchema } from "./schema/migrate";
export { SAUNA_DEFAULT_PROPS_VERSION, saunaNodePropsVersion } from "./schema/props-version";
export { createEmptySaunaSchema } from "./schema/defaults";
export { createSaunaNodeId } from "./schema/id";

export type {
  SaunaProvider,
  SaunaSnapshot,
  SaunaVersion,
  SaunaPutOptions,
  SaunaPutResult,
} from "./providers/types";
export {
  SaunaNotFoundError,
  SaunaConflictError,
  SaunaAccessDeniedError,
  isSaunaNotFoundError,
  isSaunaConflictError,
  isSaunaAccessDeniedError,
} from "./providers/errors";

// Core: server-safe schema operations, block definitions, upcoming-props vocabulary.
export * from "./core";

