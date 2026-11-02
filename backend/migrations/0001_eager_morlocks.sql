CREATE TABLE `admin_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`actor_label` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`target_label` text NOT NULL,
	`details` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `admin_audit_time_idx` ON `admin_audit` (`created_at`);--> statement-breakpoint
ALTER TABLE `teams` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `is_system_admin` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `admin_revision` integer DEFAULT 0 NOT NULL;