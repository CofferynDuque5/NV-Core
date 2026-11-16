-- Internal team notes in Inbox chats (Message.direction = 'note').
ALTER TABLE "Message" ADD COLUMN "author" TEXT;
