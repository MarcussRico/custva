import { Queue, type JobsOptions } from "bullmq";
import { env } from "../config.js";

const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 2000
  },
  removeOnComplete: 500,
  removeOnFail: 1000
};

let campaignDispatchQueue: Queue | null = null;
let lifecycleDispatchQueue: Queue | null = null;

export function getCampaignDispatchQueue() {
  if (!campaignDispatchQueue) {
    campaignDispatchQueue = new Queue("campaign_dispatch_queue", {
      connection: { url: env.REDIS_URL },
      defaultJobOptions
    });
  }
  return campaignDispatchQueue;
}

export function getLifecycleDispatchQueue() {
  if (!lifecycleDispatchQueue) {
    lifecycleDispatchQueue = new Queue("lifecycle_dispatch_queue", {
      connection: { url: env.REDIS_URL },
      defaultJobOptions
    });
  }
  return lifecycleDispatchQueue;
}
