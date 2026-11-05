/**
 * Example content of the public demo: fictional people, chats, groups,
 * campaigns with their send history, payments, tasks and posts, so «Ver demo»
 * looks like the screenshots of the sales site. Generic product names (no
 * third-party brands), fake phone numbers and payment details. Every row id
 * starts with «demo_» and the set is rebuilt at each start, so dates stay
 * recent. $1 is the demo brand's slug.
 */
export const DEMO_SHOWCASE_SQL: readonly string[] = [
  `INSERT INTO "Contact"(id,"workspaceSlug",name,phone,email,company,tags,stage,"lastContactAt","consentAt","consentSource",attribution,"createdAt")
SELECT 'demo_sc'||g,$1,
 (ARRAY['María Fernanda Rojas','Carlos Mendoza','Andrea Salazar','José Gregorio Pérez','Daniela Castillo','Luis Alberto Torres','Gabriela Morales','Ricardo Hernández','Valentina Ríos','Miguel Ángel Suárez','Camila Gutiérrez','Fernando Díaz','Paola Vargas','Jesús Rodríguez','Sofía Medina','Alejandro Ramírez','Isabel Cordero','Rafael Blanco','Natalia Flores','Héctor Romero','Mariana López','Diego Chacón','Lucía Paredes','Antonio Guerra'])[g],
 '58412'||lpad((1234567+g*7919)::text,7,'0'),
 lower(replace(split_part((ARRAY['maria','carlos','andrea','jose','daniela','luis','gabriela','ricardo','valentina','miguel','camila','fernando','paola','jesus','sofia','alejandro','isabel','rafael','natalia','hector','mariana','diego','lucia','antonio'])[g],' ',1),' ',''))||g||'@gmail.com',
 (ARRAY[NULL,'Boutique Aurora','Café del Centro',NULL,'Estudio Pilates Vida',NULL,'TecnoShop CCS','Inversiones RH',NULL,'Barbería Clásica'])[1+(g%10)],
 CASE g%6 WHEN 0 THEN ARRAY['streaming','pantallas'] WHEN 1 THEN ARRAY['cliente-vip'] WHEN 2 THEN ARRAY['streaming','combos'] WHEN 3 THEN ARRAY['interesado'] WHEN 4 THEN ARRAY['revendedor'] ELSE ARRAY['streaming','música'] END,
 (ARRAY['Lead','Cliente','Cliente','Lead','En riesgo','Cliente','Inactivo'])[1+(g%7)],
 now() - ((g%9)||' days')::interval - ((g*37%600)||' minutes')::interval,
 now() - ((g%30)||' days')::interval,'whatsapp',
 CASE WHEN g%3=0 THEN '{"source":"instagram","medium":"social","campaign":"promo-noviembre"}'::jsonb WHEN g%3=1 THEN '{"source":"whatsapp","medium":"grupo"}'::jsonb ELSE '{"source":"google","medium":"organic"}'::jsonb END,
 now() - ((g*2)||' days')::interval
FROM generate_series(1,24) g`,
  `INSERT INTO "Conversation"(id,"workspaceSlug",channel,"contactName","contactHandle",resolved,labels,"unreadCount","createdAt")
SELECT 'demo_scv'||g,$1,(ARRAY['wa','wa','ig','wa','fb','tg','wa','ig'])[g]::"ChannelId",
 (ARRAY['María Fernanda Rojas','Carlos Mendoza','Andrea Salazar','José Gregorio Pérez','Daniela Castillo','Luis Alberto Torres','Gabriela Morales','Ricardo Hernández'])[g],
 (ARRAY['+58 412-1242486','+58 414-5532190','@andrea.salazar','+58 424-7781203','Daniela Castillo','@luistorres','+58 412-9901122','@ricardo.hdz'])[g],
 g>6,CASE g WHEN 1 THEN ARRAY['venta'] WHEN 2 THEN ARRAY['soporte'] WHEN 3 THEN ARRAY['venta','urgente'] WHEN 5 THEN ARRAY['renovación'] WHEN 7 THEN ARRAY['venta'] ELSE ARRAY[]::text[] END,
 (ARRAY[2,0,1,0,3,0,0,0])[g], now() - (g||' days')::interval
FROM generate_series(1,8) g`,
  `INSERT INTO "Message"(id,"conversationId",direction,text,"createdAt")
SELECT 'demo_sm'||c||'_'||i,'demo_scv'||c,CASE WHEN i%2=1 THEN 'in' ELSE 'out' END,
 (ARRAY['Hola! Vi la promo de la pantalla de streaming en el grupo, ¿todavía está disponible?','¡Hola! Sí, claro 😊 La pantalla mensual está en US$4 o 160 Bs. ¿Te la activo hoy?','Perfecto, ¿cómo te pago? Tengo Pago Móvil','Te paso los datos: Banco de Venezuela, 0412-0000000, V-00000000. Me mandas la captura y te activo al momento.','Listo, ya te envié el comprobante 🙌','¡Recibido! Ya tienes tu pantalla activa. Gracias por tu compra 💜'])[i],
 now() - (c||' days')::interval + (i*4||' minutes')::interval
FROM generate_series(1,8) c, generate_series(1,6) i WHERE i <= 2 + (c % 5)`,
  `INSERT INTO "Group"(id,"workspaceSlug",name,channel,members,admins,description,tags,synced,category,country,"requiresPrice","createdAt")
SELECT 'demo_sg'||g,$1,
 (ARRAY['Ventas Caracas 🛍️','Emprendedores Valencia','Compra y Venta Maracay','Ofertas Barquisimeto','Streaming VIP Venezuela','Ventas Bogotá Norte','Emprendedores Lima','Mercado Margarita','Revendedores Streaming','Clasificados Zulia','Tecnología y Más','Ofertas Medellín'])[g],
 (ARRAY['wa','wa','wa','wa','wa','wa','wa','wa','tg','wa','tg','wa'])[g]::"ChannelId",
 (ARRAY[812,455,1023,367,256,689,540,298,1450,733,980,612])[g],(1+g%4),NULL,ARRAY['ventas'],true,
 (ARRAY['ventas','emprendedores','ventas','ofertas','streaming','ventas','emprendedores','ventas','streaming','ventas','tecnología','ofertas'])[g],
 (ARRAY['VE','VE','VE','VE','VE','CO','PE','VE','VE','VE','VE','CO'])[g], g%2=0, now() - ((20+g)||' days')::interval
FROM generate_series(1,12) g`,
  `INSERT INTO "Campaign"(id,"workspaceSlug",name,status,channels,progress,"nextRunAt",accent,message,"scheduleType","scheduleTimes","scheduleDays",prices,category,"lastRunAt","createdAt")
VALUES
('demo_scp1',$1,'Promo pantallas de noviembre','activa',ARRAY['wa','ig']::"ChannelId"[],68,now()+interval '3 hours','#5F86F2','🔥 *Pantalla de streaming* desde {{precio}} al mes. Activación inmediata. ¡Escríbeme!','daily',ARRAY['09:00','15:00','20:00'],ARRAY[]::int[],'{"USD":4,"VES":160,"COP":16000}','streaming',now()-interval '5 hours',now()-interval '12 days'),
('demo_scp2',$1,'Combo series y películas','programada',ARRAY['wa']::"ChannelId"[],0,now()+interval '1 day','#8C7BEF','🎬 *Combo series + películas* por {{precio}}. Solo esta semana.','weekly',ARRAY['10:00'],ARRAY[1,3,5],'{"USD":7}','streaming',NULL,now()-interval '3 days'),
('demo_scp3',$1,'Música sin anuncios','completada',ARRAY['wa','tg']::"ChannelId"[],100,NULL,'#22C55E','🎧 *Música sin anuncios* por {{precio}} al mes.','once',ARRAY[]::text[],ARRAY[]::int[],'{"USD":3}','streaming',now()-interval '6 days',now()-interval '20 days'),
('demo_scp4',$1,'Black Friday streaming','pausada',ARRAY['wa','fb','ig']::"ChannelId"[],35,NULL,'#F59E0B','🖤 Black Friday: 3 meses al precio de 2.','daily',ARRAY['12:00'],ARRAY[]::int[],'{"USD":10}','promociones',now()-interval '2 days',now()-interval '8 days')`,
  `INSERT INTO "CampaignTarget"(id,"campaignId","groupId") SELECT 'demo_sct'||c||'_'||g,'demo_scp'||c,'demo_sg'||g FROM generate_series(1,4) c, generate_series(1,12) g WHERE (g+c)%3<>0`,
  `INSERT INTO "SendLog"(id,"workspaceSlug","campaignId","campaignName","groupId","groupName",target,format,preview,ok,error,"runKey","createdAt")
SELECT 'demo_ssl'||d||'_'||g,$1,'demo_scp1','Promo pantallas de noviembre','demo_sg'||g,(SELECT name FROM "Group" WHERE id='demo_sg'||g),'wa','text','🔥 Pantalla de streaming…', NOT (g=4 AND d%3=0), CASE WHEN g=4 AND d%3=0 THEN 'El grupo solo permite mensajes de administradores' END,'demo_run'||d, now()-(d||' days')::interval-(g*3||' minutes')::interval
FROM generate_series(0,6) d, generate_series(1,12) g WHERE (g+1)%3<>0`,
  `INSERT INTO "Product"(id,"workspaceSlug",name,description,category,prices,sku,stock,active,"updatedAt")
VALUES ('demo_sp1',$1,'Pantalla de streaming · 1 mes','Perfil propio por 30 días, con garantía.','Streaming','{"USD":4,"VES":160,"COP":16000}','PAN-1',25,true,now()),
('demo_sp2',$1,'Plan series premium','Series y estrenos por 30 días.','Streaming','{"USD":3.5,"VES":140}','SER-1',18,true,now()),
('demo_sp3',$1,'Plan películas · 1 mes','Películas y clásicos por 30 días.','Streaming','{"USD":3,"VES":120}','PEL-1',12,true,now()),
('demo_sp4',$1,'Música sin anuncios','Cuenta individual por 30 días.','Música','{"USD":3,"VES":120,"PEN":11}','MUS-1',30,true,now()),
('demo_sp5',$1,'Videos sin anuncios','Videos y música sin anuncios por 30 días.','Streaming','{"USD":3.5}','VID-1',9,true,now()),
('demo_sp6',$1,'Combo familia','Tres pantallas con un solo pago.','Combos','{"USD":9.5,"VES":380}','CMB-F',6,true,now())`,
  `INSERT INTO "PaymentMethod"(id,"workspaceSlug",kind,label,currency,details,instructions)
VALUES ('demo_spm1',$1,'pago_movil','Pago Móvil Banco de Venezuela','VES','{"bank":"Banco de Venezuela","phone":"0412-0000000","doc":"V-00000000"}','Envía la captura con la referencia.'),
('demo_spm2',$1,'binance_pay','Binance Pay','USDT','{"payId":"000000000"}',NULL),
('demo_spm3',$1,'zinli','Zinli','USD','{"email":"pagos@ejemplo.com"}',NULL),
('demo_spm4',$1,'nequi','Nequi','COP','{"phone":"300 000 0000"}',NULL)`,
  `INSERT INTO "PaymentRequest"(id,"workspaceSlug",concept,amount,currency,status,"contactId","methodId","methodLabel",reference,"dueAt","paidAt","createdBy","updatedAt","createdAt")
VALUES ('demo_spr1',$1,'Pantalla de streaming · noviembre',160,'VES','pagado','demo_sc1','demo_spm1','Pago Móvil Banco de Venezuela','004512',now()+interval '2 days',now()-interval '1 day','demo@nvmarketing.demo',now(),now()-interval '2 days'),
('demo_spr2',$1,'Combo familia',9.5,'USD','por_verificar','demo_sc2','demo_spm2','Binance Pay','BN-88213',now()+interval '1 day',NULL,'demo@nvmarketing.demo',now(),now()-interval '5 hours'),
('demo_spr3',$1,'Música sin anuncios',16000,'COP','pendiente','demo_sc6','demo_spm4','Nequi',NULL,now()+interval '3 days',NULL,'demo@nvmarketing.demo',now(),now()-interval '1 day'),
('demo_spr4',$1,'Plan series premium',3.5,'USD','pagado','demo_sc3','demo_spm3','Zinli','ZN-5521',now(),now()-interval '3 days','demo@nvmarketing.demo',now(),now()-interval '4 days'),
('demo_spr5',$1,'Videos sin anuncios',3.5,'USD','vencido','demo_sc9','demo_spm3','Zinli',NULL,now()-interval '2 days',NULL,'demo@nvmarketing.demo',now(),now()-interval '6 days')`,
  `INSERT INTO "Task"(id,"workspaceSlug",title,description,status,priority,assignee,"dueAt",position,"createdBy","updatedAt","contactId")
VALUES ('demo_st1',$1,'Renovar pantallas de clientes VIP','Revisar quién vence esta semana.','todo','high','Ana (ventas)',now()+interval '1 day',1,'demo@nvmarketing.demo',now(),'demo_sc2'),
('demo_st2',$1,'Diseñar flyer Black Friday','','doing','normal','Luis (diseño)',now()+interval '2 days',1,'demo@nvmarketing.demo',now(),NULL),
('demo_st3',$1,'Responder dudas de Instagram','','todo','normal','Luis (diseño)',now(),2,'demo@nvmarketing.demo',now(),NULL),
('demo_st4',$1,'Cargar nuevos productos en Tienda','','done','low','Ana (ventas)',now()-interval '1 day',1,'demo@nvmarketing.demo',now(),NULL),
('demo_st5',$1,'Verificar pago Binance de Carlos','Referencia BN-88213','doing','high','Ana (ventas)',now(),2,'demo@nvmarketing.demo',now(),'demo_sc2')`,
  `INSERT INTO "Post"(id,"workspaceSlug","campaignId",channel,title,copy,hashtags,status,"scheduledAt")
SELECT 'demo_spo'||g,$1,'demo_scp1',(ARRAY['ig','fb','wa','ig','tk','ig','fb','wa','ig','fb'])[g]::"ChannelId",
 (ARRAY['Promo pantallas','Testimonio cliente','Combo familia','Reel: cómo activar','Tutorial de series','Sorteo semanal','Black Friday','Recordatorio pago','Nuevo: videos sin anuncios','Cierre de mes'])[g],
 'Publicación de ejemplo',ARRAY['streaming','ofertas'],
 (CASE WHEN g<4 THEN 'sent' ELSE 'scheduled' END)::"PostStatus",
 date_trunc('day',now()) + ((g*2-6)||' days')::interval + interval '15 hours'
FROM generate_series(1,10) g`,
  `INSERT INTO "Notification"(id,"workspaceSlug",type,title,meta,read,"createdAt")
VALUES ('demo_sn1',$1,'success','Campaña «Promo pantallas de noviembre» terminó su envío','10 de 11 grupos',false,now()-interval '5 hours'),
('demo_sn2',$1,'warning','Pago por verificar: Combo familia','Carlos Mendoza · US$9,50',false,now()-interval '5 hours'),
('demo_sn3',$1,'info','Nuevo lead desde el formulario','Andrea Salazar',true,now()-interval '1 day')`,
];

/** Tables the showcase fills, children first (to clear them before rebuilding). */
export const DEMO_SHOWCASE_TABLES = [
  "Notification",
  "Post",
  "Task",
  "PaymentRequest",
  "PaymentMethod",
  "Product",
  "SendLog",
  "CampaignTarget",
  "Campaign",
  "Group",
  "Message",
  "Conversation",
  "Contact",
] as const;
