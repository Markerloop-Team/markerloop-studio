// Upcoming Props — vocabulary only.
//
// Upcoming Props are values a block declares it needs but does not own.
// At render time the page (via its collection binding + route) supplies
// them. In Studio this surfaces as binding chips on the properties form.
//
// This file ships the *vocabulary*: the shape of a binding marker in
// the schema, plus a type guard. Phase 3 (`./data`) adds the resolver
// that walks a schema, collects bindings, batch-fetches, and injects
// resolved values into the renderer.

/**
 * Dot-path into the page's data context. Examples:
 *   - "record.title"
 *   - "record.author.name"
 *   - "records[0].slug"
 */
export type UpcomingPropPath = string;

/**
 * Marker placed in `SaunaNodeConfig.props` where a binding should
 * resolve from the page's data context at render time.
 *
 * @example
 *   { heading: { $bind: "course.title" } }
 */
export type UpcomingPropBinding = {
  $bind: UpcomingPropPath;
};

/** Narrow `unknown` to a binding marker. */
export function isUpcomingPropBinding(value: unknown): value is UpcomingPropBinding {
  return (
    typeof value === "object" &&
    value !== null &&
    "$bind" in value &&
    typeof (value as { $bind: unknown }).$bind === "string"
  );
}

/**
 * Helper for authoring schemas by hand. The Studio constructs bindings
 * directly through schema-ops, but tests and seed data benefit from a
 * tiny constructor.
 */
export function bind(path: UpcomingPropPath): UpcomingPropBinding {
  return { $bind: path };
}
