/**
 * Fine-grained RBAC Permission System — Constants & Matrix
 *
 * Architecture:
 * - Resources: what can be acted upon (endpoints, events, analytics, billing, etc.)
 * - Actions: what can be done (create, read, update, delete, execute)
 * - Roles: predefined permission bundles (owner, admin, developer, viewer)
 * - Custom roles: user-defined permission sets stored per project/workspace
 *
 * The permission matrix defines the default capabilities of each built-in role.
 * Custom roles allow granular overrides per project.
 */

// ── Resource types ──────────────────────────────────────────────────────────
export enum Resource {
  ENDPOINTS         = 'endpoints',
  EVENTS            = 'events',
  ANALYTICS         = 'analytics',
  BILLING           = 'billing',
  TEAM              = 'team',
  PROJECTS          = 'projects',
  WEBHOOKS          = 'webhooks',
  ALERTS            = 'alerts',
  TRANSFORMATIONS   = 'transformations',
  EVENT_CATALOG     = 'event_catalog',
  API_KEYS          = 'api_keys',
  AUDIT             = 'audit',
  DLQ               = 'dlq',
  PORTAL            = 'portal',
  SCHEDULED_EVENTS  = 'scheduled_events',
  SETTINGS          = 'settings',
}

// ── Action types ────────────────────────────────────────────────────────────
export enum Action {
  CREATE   = 'create',
  READ     = 'read',
  UPDATE   = 'update',
  DELETE   = 'delete',
  EXECUTE  = 'execute',   // replay, broadcast, test, dispatch
}

// ── Built-in role types ─────────────────────────────────────────────────────
export enum ProjectRole {
  OWNER     = 'owner',
  ADMIN     = 'admin',
  DEVELOPER = 'developer',
  VIEWER    = 'viewer',
}

// ── Permission string format: "resource:action" ──────────────────────────────
export type Permission = `${Resource}:${Action}`;

// ── Default permission matrix per built-in role ─────────────────────────────
export const ROLE_PERMISSIONS: Record<ProjectRole, Permission[]> = {
  [ProjectRole.OWNER]: [
    // Full access to everything
    ...Object.values(Resource).flatMap((r) =>
      Object.values(Action).map((a) => `${r}:${a}` as Permission),
    ),
  ],

  [ProjectRole.ADMIN]: [
    // Everything except billing delete and team owner-level ops
    'endpoints:create', 'endpoints:read', 'endpoints:update', 'endpoints:delete', 'endpoints:execute',
    'events:create', 'events:read', 'events:update', 'events:delete', 'events:execute',
    'analytics:read',
    'billing:read',  // can view, not modify
    'team:read', 'team:create', 'team:update',  // can manage members, not delete project
    'projects:read', 'projects:update',
    'webhooks:create', 'webhooks:read', 'webhooks:execute',
    'alerts:create', 'alerts:read', 'alerts:update', 'alerts:delete',
    'transformations:create', 'transformations:read', 'transformations:update', 'transformations:delete',
    'event_catalog:create', 'event_catalog:read', 'event_catalog:update', 'event_catalog:delete',
    'api_keys:create', 'api_keys:read', 'api_keys:delete',
    'audit:read',
    'dlq:read', 'dlq:execute',  // view and replay DLQ
    'portal:read', 'portal:update',
    'scheduled_events:create', 'scheduled_events:read', 'scheduled_events:update', 'scheduled_events:delete',
    'settings:read', 'settings:update',
  ],

  [ProjectRole.DEVELOPER]: [
    // Can build and operate, but not manage team or billing
    'endpoints:create', 'endpoints:read', 'endpoints:update', 'endpoints:execute',
    'events:create', 'events:read', 'events:execute',
    'analytics:read',
    'webhooks:create', 'webhooks:read', 'webhooks:execute',
    'alerts:create', 'alerts:read', 'alerts:update',
    'transformations:create', 'transformations:read', 'transformations:update',
    'event_catalog:create', 'event_catalog:read', 'event_catalog:update',
    'api_keys:create', 'api_keys:read',
    'audit:read',
    'dlq:read', 'dlq:execute',
    'portal:read',
    'scheduled_events:create', 'scheduled_events:read', 'scheduled_events:update',
    'settings:read',
  ],

  [ProjectRole.VIEWER]: [
    // Read-only across the board
    'endpoints:read',
    'events:read',
    'analytics:read',
    'webhooks:read',
    'alerts:read',
    'transformations:read',
    'event_catalog:read',
    'audit:read',
    'dlq:read',
    'portal:read',
    'scheduled_events:read',
    'settings:read',
  ],
};

/**
 * All possible permissions (used for validation)
 */
export const ALL_PERMISSIONS: Permission[] = Object.values(Resource).flatMap(
  (r) => Object.values(Action).map((a) => `${r}:${a}` as Permission),
);
