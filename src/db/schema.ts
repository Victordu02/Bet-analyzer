import { pgTable, text, jsonb, primaryKey } from 'drizzle-orm/pg-core';

const entity = (name: string) => pgTable(name, {
  workspace: text('workspace').notNull(),
  id: text('id').notNull(),
  document: jsonb('document').$type<Record<string, unknown>>().notNull(),
}, table => [primaryKey({columns: [table.workspace, table.id]})]);

export const tipsters = entity('tipsters');
export const picks = entity('picks');
export const quotes = entity('quotes');
export const tickets = entity('tickets');
export const ledger = entity('ledger');
export const strategies = entity('strategies');
export const simulations = entity('simulations');
export const imports = entity('imports');
export const audit = entity('audit');
export const settings = entity('settings');
