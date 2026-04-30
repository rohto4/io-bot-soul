import type { DbClient } from "./db/client.js";
import type {
  MisskeyClient,
  MisskeyNotification,
  MisskeyReaction,
  MisskeyUserLite
} from "./misskey/client.js";
import type { Logger } from "./logger.js";

const acceptedHeartReactions = new Set(["❤", "❤️"]);

export function mention(user: MisskeyUserLite): string {
  return user.host ? `@${user.username}@${user.host}` : `@${user.username}`;
}

export function buildProbeReply(user: MisskeyUserLite): string {
  return `${mention(user)} 受信確認できたよ。今はリプライ動作テスト中です。`;
}

export function buildFollowGuide(user: MisskeyUserLite): string {
  return `${mention(user)} フォローありがとう。\nあなたの投稿を私の生活の一部にしてもいい？\nよければ、ピン留めノートに❤をつけてね。`;
}

export function parseReplyCommand(text: string | null | undefined): "stop" | "unfollow" | null {
  const normalized = text?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === "/stop") {
    return "stop";
  }

  if (normalized === "/unfollow") {
    return "unfollow";
  }

  return null;
}

export async function handleReplyProbe(options: {
  db: DbClient;
  client: MisskeyClient;
  logger: Logger;
  maxReplies: number;
  at: string;
}): Promise<void> {
  const notifications = await options.client.getNotifications({
    limit: 20,
    includeTypes: ["mention", "reply"],
    markAsRead: false
  });

  let posted = 0;
  for (const notification of [...notifications].reverse()) {
    const didPost = await handleReplyNotification({ ...options, notification });
    if (didPost) {
      posted += 1;
    }
    if (posted >= options.maxReplies) {
      return;
    }
  }
}

export async function handleFollowProbe(options: {
  db: DbClient;
  client: MisskeyClient;
  logger: Logger;
  maxFollows: number;
  at: string;
}): Promise<void> {
  const notifications = await options.client.getNotifications({
    limit: 20,
    includeTypes: ["follow"],
    markAsRead: false
  });

  let handled = 0;
  for (const notification of [...notifications].reverse()) {
    const didHandle = await handleFollowNotification({ ...options, notification });
    if (didHandle) {
      handled += 1;
    }
    if (handled >= options.maxFollows) {
      return;
    }
  }
}

async function handleFollowNotification(options: {
  db: DbClient;
  client: MisskeyClient;
  logger: Logger;
  at: string;
  notification: MisskeyNotification;
}): Promise<boolean> {
  const user = options.notification.user;
  await options.db.run(
      `
      INSERT INTO notifications_seen (notification_id, notification_type, user_id, note_id, seen_at, action)
      VALUES (@notification_id, @notification_type, @user_id, NULL, @seen_at, @action)
      ON CONFLICT(notification_id) DO NOTHING
      `,
    {
      notification_id: options.notification.id,
      notification_type: options.notification.type,
      user_id: user?.id ?? null,
      seen_at: options.at,
      action: "follow_seen"
    }
  );

  if (!user?.id) {
    options.logger.warn("followProbe.skip", {
      reason: "missing_user",
      notificationId: options.notification.id
    });
    return false;
  }

  const existing = await options.db.get(
    "SELECT id FROM consent_guides WHERE user_id = @user_id AND status = 'posted' LIMIT 1",
    { user_id: user.id }
  );

  if (existing) {
    options.logger.debug("followProbe.skip", {
      reason: "already_guided",
      userId: user.id
    });
    return false;
  }

  try {
    await options.client.createFollowing({ userId: user.id });
  } catch (error: unknown) {
    const message = String(error);
    if (!message.includes("ALREADY_FOLLOWING")) {
      throw error;
    }
    options.logger.info("followProbe.alreadyFollowing", {
      userId: user.id,
      username: user.username
    });
  }
  const guide = await options.client.createNote({
    text: buildFollowGuide(user)
  });

  await options.db.run(
      `
      INSERT INTO consent_guides (user_id, guide_note_id, pinned_consent_note_id, requested_at, status)
      VALUES (@user_id, @guide_note_id, @pinned_consent_note_id, @requested_at, 'posted')
      `,
    {
      user_id: user.id,
      guide_note_id: guide.id,
      pinned_consent_note_id: "",
      requested_at: options.at
    }
  );

  await options.db.run(
      `
      INSERT INTO experience_source_consents (
        user_id,
        username,
        host,
        consent_status,
        last_checked_at,
        created_at,
        updated_at
      )
      VALUES (@user_id, @username, @host, 'pending', @last_checked_at, @created_at, @updated_at)
      ON CONFLICT(user_id) DO UPDATE SET
        username = excluded.username,
        host = excluded.host,
        last_checked_at = excluded.last_checked_at,
        updated_at = excluded.updated_at
      `,
    {
      user_id: user.id,
      username: user.username,
      host: user.host ?? null,
      last_checked_at: options.at,
      created_at: options.at,
      updated_at: options.at
    }
  );

  options.logger.info("followProbe.guided", {
    userId: user.id,
    username: user.username,
    guideNoteId: guide.id
  });
  return true;
}

async function handleReplyNotification(options: {
  db: DbClient;
  client: MisskeyClient;
  logger: Logger;
  at: string;
  notification: MisskeyNotification;
}): Promise<boolean> {
  const note = options.notification.note;
  const user = options.notification.user ?? note?.user;

  await options.db.run(
      `
      INSERT INTO notifications_seen (notification_id, notification_type, user_id, note_id, seen_at, action)
      VALUES (@notification_id, @notification_type, @user_id, @note_id, @seen_at, @action)
      ON CONFLICT(notification_id) DO NOTHING
      `,
    {
      notification_id: options.notification.id,
      notification_type: options.notification.type,
      user_id: user?.id ?? null,
      note_id: note?.id ?? null,
      seen_at: options.at,
      action: "reply_probe_seen"
    }
  );

  if (!note?.id || !user?.id) {
    options.logger.warn("replyProbe.skip", {
      reason: "missing_note_or_user",
      notificationId: options.notification.id
    });
    return false;
  }

  const existing = await options.db.get(
    "SELECT reply_note_id FROM reply_logs WHERE target_note_id = @target_note_id LIMIT 1",
    { target_note_id: note.id }
  );

  if (existing) {
    options.logger.debug("replyProbe.skip", {
      reason: "already_replied",
      targetNoteId: note.id
    });
    return false;
  }

  const command = parseReplyCommand(note.text);
  if (command) {
    return await handleReplyCommand({ ...options, noteId: note.id, user, command });
  }

  const reply = await options.client.createNote({
    replyId: note.id,
    text: buildProbeReply(user)
  });

  await options.db.run(
      `
      INSERT INTO reply_logs (target_note_id, target_user_id, reply_note_id, replied_at, reason, status)
      VALUES (@target_note_id, @target_user_id, @reply_note_id, @replied_at, @reason, @status)
      `,
    {
      target_note_id: note.id,
      target_user_id: user.id,
      reply_note_id: reply.id,
      replied_at: options.at,
      reason: "reply_probe",
      status: "posted"
    }
  );

  options.logger.info("replyProbe.posted", {
    targetNoteId: note.id,
    replyNoteId: reply.id,
    targetUserId: user.id
  });
  return true;
}

async function handleReplyCommand(options: {
  db: DbClient;
  client: MisskeyClient;
  logger: Logger;
  at: string;
  noteId: string;
  user: MisskeyUserLite;
  command: "stop" | "unfollow";
}): Promise<boolean> {
  if (options.command === "unfollow") {
    await options.client.deleteFollowing({ userId: options.user.id });
  }

  const status = options.command === "stop" ? "stopped" : "unfollowed";
  const timestampColumn = options.command === "stop" ? "stopped_at" : "unfollowed_at";
  await options.db.run(
      `
      INSERT INTO experience_source_consents (
        user_id,
        username,
        host,
        consent_status,
        ${timestampColumn},
        last_checked_at,
        created_at,
        updated_at
      )
      VALUES (
        @user_id,
        @username,
        @host,
        @consent_status,
        @commanded_at,
        @last_checked_at,
        @created_at,
        @updated_at
      )
      ON CONFLICT(user_id) DO UPDATE SET
        username = excluded.username,
        host = excluded.host,
        consent_status = excluded.consent_status,
        ${timestampColumn} = excluded.${timestampColumn},
        last_checked_at = excluded.last_checked_at,
        updated_at = excluded.updated_at
      `,
    {
      user_id: options.user.id,
      username: options.user.username,
      host: options.user.host ?? null,
      consent_status: status,
      commanded_at: options.at,
      last_checked_at: options.at,
      created_at: options.at,
      updated_at: options.at
    }
  );

  const replyText =
    options.command === "stop"
      ? `${mention(options.user)} 了解。リプライや引用RNなどの接触を止めます。`
      : `${mention(options.user)} 了解。フォロー解除して、今後あなたのノートを体験候補に使いません。`;

  const reply = await options.client.createNote({
    replyId: options.noteId,
    text: replyText
  });

  await options.db.run(
      `
      INSERT INTO reply_logs (target_note_id, target_user_id, reply_note_id, replied_at, reason, status)
      VALUES (@target_note_id, @target_user_id, @reply_note_id, @replied_at, @reason, @status)
      `,
    {
      target_note_id: options.noteId,
      target_user_id: options.user.id,
      reply_note_id: reply.id,
      replied_at: options.at,
      reason: options.command,
      status: "posted"
    }
  );

  options.logger.info("replyCommand.handled", {
    command: options.command,
    targetNoteId: options.noteId,
    replyNoteId: reply.id,
    targetUserId: options.user.id
  });
  return true;
}

export async function handleConsentReactions(options: {
  db: DbClient;
  client: MisskeyClient;
  logger: Logger;
  pinnedConsentNoteId: string;
  at: string;
}): Promise<void> {
  if (!options.pinnedConsentNoteId) {
    options.logger.warn("consentReaction.skip", { reason: "missing_pinned_consent_note_id" });
    return;
  }

  const reactions = await options.client.getNoteReactions({
    noteId: options.pinnedConsentNoteId,
    limit: 100
  });

  for (const reaction of reactions) {
    if (acceptedHeartReactions.has(reaction.type)) {
      await saveConsentReaction({ ...options, reaction });
    }
  }
}

async function saveConsentReaction(options: {
  db: DbClient;
  logger: Logger;
  pinnedConsentNoteId: string;
  at: string;
  reaction: MisskeyReaction;
}): Promise<void> {
  await options.db.run(
      `
      INSERT INTO experience_source_consents (
        user_id,
        username,
        host,
        consent_status,
        pinned_consent_note_id,
        consented_reaction,
        consented_at,
        last_checked_at,
        created_at,
        updated_at
      )
      VALUES (
        @user_id,
        @username,
        @host,
        'consented',
        @pinned_consent_note_id,
        @consented_reaction,
        @consented_at,
        @last_checked_at,
        @created_at,
        @updated_at
      )
      ON CONFLICT(user_id) DO UPDATE SET
        username = excluded.username,
        host = excluded.host,
        consent_status = 'consented',
        pinned_consent_note_id = excluded.pinned_consent_note_id,
        consented_reaction = excluded.consented_reaction,
        consented_at = COALESCE(experience_source_consents.consented_at, excluded.consented_at),
        last_checked_at = excluded.last_checked_at,
        updated_at = excluded.updated_at
      `,
    {
      user_id: options.reaction.user.id,
      username: options.reaction.user.username,
      host: options.reaction.user.host ?? null,
      pinned_consent_note_id: options.pinnedConsentNoteId,
      consented_reaction: options.reaction.type,
      consented_at: options.reaction.createdAt,
      last_checked_at: options.at,
      created_at: options.at,
      updated_at: options.at
    }
  );

  options.logger.info("consentReaction.saved", {
    userId: options.reaction.user.id,
    username: options.reaction.user.username,
    reaction: options.reaction.type
  });
}
