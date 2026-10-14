import { applySesFeedback, feedbackTopicArn, isAwsSnsUrl, verifySnsMessage, type SnsMessage } from "@/lib/email-feedback";
import { json } from "@/lib/http";
import { log } from "@/lib/logger";

/**
 * SNS delivery of SES bounce and complaint notices. Any AWS account can make a topic that SNS signs, so the
 * signature alone proves nothing: the topic must also be ours (AWS_SES_SNS_TOPIC_ARN). The subscription is
 * confirmed here on its first message, so subscribing the URL in the SNS console is the whole setup.
 */
export async function POST(request: Request) {
  const topic = feedbackTopicArn();
  if (!topic) return json({ error: "Email feedback is not configured" }, 503);

  let message: SnsMessage;
  try {
    message = JSON.parse(await request.text());
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (message.TopicArn !== topic) return json({ error: "Unknown topic" }, 403);
  if (!(await verifySnsMessage(message))) {
    log.warn("SNS signature mismatch on email feedback");
    return json({ error: "Unauthorized" }, 401);
  }

  if (message.Type === "SubscriptionConfirmation") {
    if (!isAwsSnsUrl(message.SubscribeURL)) return json({ error: "Bad subscribe URL" }, 400);
    const confirmed = await fetch(message.SubscribeURL!, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (!confirmed?.ok) return json({ error: "Could not confirm the subscription" }, 502);
    log.info("Confirmed the SNS subscription for SES feedback");
    return json({ ok: true });
  }
  if (message.Type !== "Notification") return json({ ok: true });

  try {
    await applySesFeedback(JSON.parse(message.Message));
  } catch (error) {
    // A 500 makes SNS retry, which is what we want if the database blipped.
    log.warn("Could not apply SES feedback", error instanceof Error ? error.message : error);
    return json({ error: "Could not apply feedback" }, 500);
  }
  return json({ ok: true });
}
