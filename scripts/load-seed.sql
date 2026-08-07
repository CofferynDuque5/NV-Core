-- NV Core · load-test seed. Fills one workspace ('fitness') with ~100k rows per
-- high-volume table so list/analytics endpoints can be measured at scale.
--   psql "$DATABASE_URL" -f scripts/load-seed.sql
-- Idempotency: run against a fresh/empty DB (after `prisma migrate deploy`).

INSERT INTO "Contact"(id,"workspaceSlug",name,phone,email,company,tags,stage,"createdAt")
SELECT 'k'||g,'fitness','Contacto '||g,'6'||g,'user'||g||'@mail.com','Empresa '||(g%500),
       ARRAY['tag'||(g%20)], (ARRAY['Lead','Cliente','En riesgo','Inactivo'])[1+(g%4)],
       now() - ((g % 180) || ' days')::interval
FROM generate_series(1,100000) g;

INSERT INTO "Conversation"(id,"workspaceSlug",channel,"contactName","createdAt")
SELECT 'cv'||g,'fitness',(ARRAY['wa','ig','fb'])[1+(g%3)]::"ChannelId",'Cliente '||g,
       now() - ((g%180)||' days')::interval
FROM generate_series(1,2000) g;

-- 100k messages spread over the conversations, plus a 5k "hot" thread on cv1.
INSERT INTO "Message"(id,"conversationId",direction,text,"createdAt")
SELECT 'm'||g,'cv'||(1+(g%2000)),(ARRAY['in','out'])[1+(g%2)],'msg '||g,
       now() - ((g%180)||' days')::interval
FROM generate_series(1,100000) g;
INSERT INTO "Message"(id,"conversationId",direction,text,"createdAt")
SELECT 'h'||g,'cv1','in','hot '||g, now() - ((g%24)||' hours')::interval
FROM generate_series(1,5000) g;

INSERT INTO "Post"(id,"workspaceSlug",channel,title,hashtags,status,"createdAt")
SELECT 'p'||g,'fitness',(ARRAY['ig','fb','wa'])[1+(g%3)]::"ChannelId",'Post '||g,'{}',
       (ARRAY['sent','draft'])[1+(g%2)]::"PostStatus", now() - ((g%180)||' days')::interval
FROM generate_series(1,20000) g;

ANALYZE;
