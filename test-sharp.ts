import sharp from 'sharp';

async function test() {
   let testImage1 = await sharp('test-image-1.png').toBuffer();
   let testImage2 = await sharp('test-image-2.png').toBuffer();
   let shit = await sharp({ create: { 
      width: 600,
      height: 600,
      channels: 4,
      background: { r: 0, g: 100, b: 200, alpha: .5 }
   }})
      .overlayWith(testImage1, { top: 0, left: 0 }).png().toBuffer();

   sharp(shit).overlayWith(testImage2, { top: 0, left: 200 })
      .png()
      .toFile('test-output.png');
}

test();