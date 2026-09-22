CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`username` varchar(64) NOT NULL,
	`action` varchar(80) NOT NULL,
	`entity` varchar(80),
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `crm_leads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`externalId` varchar(40),
	`companyName` varchar(255),
	`contactName` varchar(255),
	`email` varchar(320),
	`phone` varchar(40),
	`cpf` varchar(20),
	`sourceChannel` varchar(120) NOT NULL DEFAULT 'desconhecido',
	`formName` varchar(120),
	`utmSource` varchar(120),
	`utmMedium` varchar(120),
	`utmCampaign` varchar(255),
	`cep` varchar(16),
	`street` varchar(255),
	`addrNumber` varchar(24),
	`neighborhood` varchar(120),
	`city` varchar(120),
	`state` varchar(8),
	`birthDate` varchar(20),
	`products` varchar(255),
	`extraContext` varchar(255),
	`status` varchar(60),
	`opportunityNumber` varchar(24),
	`opportunityName` varchar(255),
	`opportunityTag` varchar(120),
	`opportunityStage` varchar(40),
	`createdDate` date NOT NULL,
	`updatedDate` date,
	`importedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `crm_leads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`channel` enum('geral','meta','google','programatica') NOT NULL,
	`metric` varchar(40) NOT NULL,
	`period` enum('mensal','semanal','diaria') NOT NULL DEFAULT 'mensal',
	`targetValue` double NOT NULL,
	`direction` enum('min','max') NOT NULL DEFAULT 'max',
	`createdBy` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `goals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`phone` varchar(40),
	`email` varchar(160),
	`company` varchar(120),
	`source` enum('meta','google','programatica','organico','direto','outros') NOT NULL,
	`campaign` varchar(255),
	`creative` varchar(255),
	`audience` varchar(120),
	`ageRange` varchar(20),
	`gender` varchar(20),
	`owner` varchar(80),
	`status` enum('novo','em_atendimento','qualificado','proposta','cliente','perdido','nao_qualificado') NOT NULL,
	`leadAt` timestamp NOT NULL,
	`firstContactAt` timestamp,
	`proposalAt` timestamp,
	`saleAt` timestamp,
	`saleValue` double,
	`lossReason` varchar(60),
	`disqualifyReason` varchar(60),
	`notes` text,
	CONSTRAINT `leads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `local_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`username` varchar(64) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`role` enum('admin','analista','cliente') NOT NULL DEFAULT 'cliente',
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastLogin` timestamp,
	CONSTRAINT `local_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `local_users_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `optimizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`channel` enum('geral','meta','google','programatica') NOT NULL,
	`title` varchar(255) NOT NULL,
	`diagnosis` text NOT NULL,
	`defense` text NOT NULL,
	`actionPlan` text NOT NULL,
	`priority` enum('alta','media','baixa') NOT NULL DEFAULT 'media',
	`status` enum('pendente','em_andamento','concluida','descartada') NOT NULL DEFAULT 'pendente',
	`assignee` varchar(80),
	`dueDate` date,
	`checklist` json,
	`metricsBefore` json,
	`metricsAfter` json,
	`outcome` enum('melhora','piora','sem_impacto'),
	`completedBy` varchar(64),
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `optimizations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prog_dv360` (
	`id` int AUTO_INCREMENT NOT NULL,
	`insertionOrder` varchar(255) NOT NULL,
	`format` varchar(40) NOT NULL,
	`objective` varchar(80) NOT NULL,
	`geo` varchar(40) NOT NULL,
	`day` date NOT NULL,
	`spend` double NOT NULL,
	`impressions` int NOT NULL,
	`clicks` int NOT NULL,
	`viewability` double NOT NULL,
	`completeViews` int NOT NULL,
	`completionRate` double NOT NULL,
	CONSTRAINT `prog_dv360_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prog_meta_social` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaign` varchar(255) NOT NULL,
	`day` date NOT NULL,
	`reach` int NOT NULL,
	`impressions` int NOT NULL,
	`frequency` double NOT NULL,
	`spend` double NOT NULL,
	`resultType` varchar(60) NOT NULL,
	`results` int NOT NULL,
	`linkClicks` int NOT NULL,
	`reactions` int NOT NULL,
	`followers` int NOT NULL,
	CONSTRAINT `prog_meta_social_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prog_push` (
	`id` int AUTO_INCREMENT NOT NULL,
	`day` date NOT NULL,
	`spend` double NOT NULL,
	`dispatches` int NOT NULL,
	`clicks` int NOT NULL,
	CONSTRAINT `prog_push_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE TABLE `windsor_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cacheKey` varchar(255) NOT NULL,
	`payload` json NOT NULL,
	`fetchedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `windsor_cache_id` PRIMARY KEY(`id`),
	CONSTRAINT `windsor_cache_cacheKey_unique` UNIQUE(`cacheKey`)
);
