import { defineApp } from "convex/server";
import webhookReceiver from "convex-webhook-receiver/convex.config";

const app = defineApp();
app.use(webhookReceiver);

export default app;
