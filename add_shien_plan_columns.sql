-- 支援計画書テンプレート 実施予定・委託・担当者住所カラム追加
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS shien_jizen_guidance_plan    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS shien_housing_plan           BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS shien_life_support_plan      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS shien_japanese_plan          BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS shien_consultation_plan      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS shien_japanese_contact_plan  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS shien_job_change_plan        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS shien_regular_meeting_plan   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS shien_outsource              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shien_staff_address          TEXT;
