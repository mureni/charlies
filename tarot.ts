import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

interface Card {
   dimensions: {
      width: number;
      height: number;
   }
   filename: string,
   imageData: sharp.Sharp;
}

const TAROT_DIR = path.join(__dirname, "rider-waite");

async function getCards(directory: string = TAROT_DIR): Promise<Card[]> {
   let files: string[] = [];   
   let results: Card[] = [];

   files = fs.readdirSync(directory).filter(file => path.extname(file).match(/png|jpe?g|webp|gif|tiff?|svg/i));
   if (!files || files.length === 0) return [];
   
   for (let file of files) {
      const imageData = await sharp(path.join(directory, file));
      const metadata = await imageData.metadata();
      const image = {
         dimensions: {
            width: metadata.width || 0,
            height: metadata.height || 0
         },
         filename: file,
         imageData: imageData
      };      
      results.push(image);
   }   
   return results;
}

function getHandDimensions(cards: Card[] = []) {
   if (cards.length === 0) return { width: 0, height: 0 }

   let maxWidth = 0;
   let maxHeight = 0;

   cards.forEach(card => {
      maxWidth += card.dimensions.width;
      maxHeight = Math.max(maxHeight, card.dimensions.height);
   });

   return { width: maxWidth, height: maxHeight };
}

async function getHand(directory: string = TAROT_DIR) {
   const cards = await getCards(directory);
   
   if (cards.length === 0) return [];

   const readCards: Card[] = [];
   const readingLength = Math.min(cards.length, 2 + Math.floor(Math.random() * 3));

   for (let cardCount = 0; cardCount < readingLength; ++cardCount) {      
      const [ pulledCard ] = cards.splice(Math.floor(Math.random() * cards.length), 1);
      if (Math.random() >= .5) pulledCard.imageData = await pulledCard.imageData.rotate(180);
      readCards.push(pulledCard);
   }

   return readCards;
}
 async function overlay(canvas: Buffer, imageData: sharp.Sharp, top: number, left: number) {
   const image = await imageData.png().toBuffer();
   return sharp(canvas).overlayWith(image, { top: top, left: left }).png().toBuffer();
} 

async function getReading(directory: string = TAROT_DIR) {
   const hand = await getHand(directory);
   const handDimensions = getHandDimensions(hand);   
   let outputImage = await sharp({
      create: {
         width: handDimensions.width,
         height: handDimensions.height,
         channels: 4,
         background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
   }).png().toBuffer(); 
   
   let xPos = 0;   

   for (let card of hand) {
      outputImage = await overlay(outputImage, card.imageData, 0, xPos);      
      xPos += card.dimensions.width;
   };
   
   return Promise.resolve(sharp(outputImage).resize(null, 400).png().toBuffer());
}

const getTarotHand = (cardSet: string = TAROT_DIR) => getReading(cardSet);
const saveHandImage = async (filename: string = path.join(__dirname, "output.png")) => {
   let image: Buffer = await getTarotHand();
   sharp(image).toFile(filename);
}

export { saveHandImage };
export default getTarotHand;