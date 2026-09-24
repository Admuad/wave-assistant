import { createInsertSchema } from "drizzle-zod";
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const waveIssuesTable = pgTable("wave_issues", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  repository: text("repository").notNull(),
  organization: text("organization").notNull(),
  url: text("url").notNull(),
  points: integer("points").notNull(),
  complexity: text("complexity").notNull(),
  status: text("status").notNull().default("open"),
  applicants: integer("applicants").notNull().default(0),
  matchedSkills: jsonb("matched_skills").$type<string[]>().notNull().default([]),
  summary: text("summary").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const waveApplicationsTable = pgTable("wave_applications", {
  id: text("id").primaryKey(),
  issueId: text("issue_id").notNull(),
  issueTitle: text("issue_title").notNull(),
  repository: text("repository").notNull(),
  status: text("status").notNull().default("pending"),
  appliedAt: timestamp("applied_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
});

export const activityEntriesTable = pgTable("activity_entries", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const contributorProfilesTable = pgTable("contributor_profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  githubUsername: text("github_username").notNull(),
  skills: jsonb("skills").$type<string[]>().notNull().default([]),
  repositories: jsonb("repositories").$type<string[]>().notNull().default([]),
  minPoints: integer("min_points").notNull().default(100),
  maxOrganizationApplications: integer("max_organization_applications")
    .notNull()
    .default(4),
});

export const notificationSettingsTable = pgTable("notification_settings", {
  id: text("id").primaryKey(),
  telegramEnabled: text("telegram_enabled").notNull().default("false"),
  assignmentAlertsEnabled: text("assignment_alerts_enabled")
    .notNull()
    .default("true"),
  telegramChatId: text("telegram_chat_id"),
  lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
});

export const insertWaveApplicationSchema = createInsertSchema(
  waveApplicationsTable,
).omit({ id: true, appliedAt: true, assignedAt: true });
export type InsertWaveApplication = z.infer<
  typeof insertWaveApplicationSchema
>;