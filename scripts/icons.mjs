import sharp from "sharp";
for (const size of [192, 512])
  await sharp("public/icon.svg")
    .resize(size, size)
    .png()
    .toFile(`public/icon-${size}.png`);
await sharp({
  create: { width: 512, height: 512, channels: 4, background: "#6d3fd1" },
})
  .composite([
    { input: await sharp("public/icon.svg").resize(380).png().toBuffer() },
  ])
  .png()
  .toFile("public/icon-maskable.png");
