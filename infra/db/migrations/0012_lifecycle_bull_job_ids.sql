-- BullMQ custom job IDs cannot contain ':'.
UPDATE lifecycle_schedules
SET bull_job_id = 'lifecycle-' || id::text
WHERE bull_job_id LIKE 'lifecycle:%';
