import { defineComponent } from "convex/server";
import workpoolComponent from "@convex-dev/workpool/convex.config";
import actionRetrierComponent from "@convex-dev/action-retrier/convex.config";

const component = defineComponent("webhookReceiver");
component.use(workpoolComponent);
component.use(actionRetrierComponent);

export default component;
