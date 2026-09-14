import { ValidationPipe } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { CreateCampaignDto } from "../../modules/campaigns/campaigns.module";
import { CreatePostDto } from "../../modules/posts/posts.module";

/**
 * Regression: with the global ValidationPipe (whitelist + transform) a bare
 * `attachments: object[]` used to come out as `[[]]` — every campaign image
 * vanished on save and only the text was sent. Attachments must survive intact.
 */
const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });

const att = { url: "https://i.ibb.co/x/foto.jpg", kind: "image", mime: "image/jpeg", filename: "foto.jpg" };

describe("attachments through the ValidationPipe", () => {
  it("keeps campaign attachments intact", async () => {
    const out = (await pipe.transform(
      { name: "Promo", message: "hola", attachments: [att] },
      { type: "body", metatype: CreateCampaignDto },
    )) as CreateCampaignDto;
    expect(out.attachments).toEqual([att]);
  });

  it("keeps post attachments intact (data: URL flyer included)", async () => {
    const flyer = { url: "data:image/png;base64,AAAA", kind: "image", mime: "image/png", filename: "flyer.png" };
    const out = (await pipe.transform(
      { channel: "wa", title: "Post", attachments: [att, flyer] },
      { type: "body", metatype: CreatePostDto },
    )) as CreatePostDto;
    expect(out.attachments).toEqual([att, flyer]);
  });

  it("rejects an attachment with unknown fields", async () => {
    await expect(
      pipe.transform(
        { name: "Promo", attachments: [{ ...att, hack: 1 }] },
        { type: "body", metatype: CreateCampaignDto },
      ),
    ).rejects.toThrow();
  });
});
