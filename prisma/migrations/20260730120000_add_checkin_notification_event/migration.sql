-- Create a dedicated audit event for admin check-in reminders.
ALTER TYPE "PlantaoEventType" ADD VALUE IF NOT EXISTS 'NotificacaoCheckIn';
