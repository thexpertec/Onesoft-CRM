// Domain schema — every table in the ERP, with proper FK constraints.
// Adding a new entity? Create its file in this directory and re-export here.

export * from "./tenants";
export * from "./accounts";
export * from "./journal-entries";
export * from "./customers";
export * from "./staff";
export * from "./audit-log";
