import MarkovChain from './markovChain';
import fs from 'fs';
interface ChatbotSettings {
   outburst: number;
   responsiveness: number;
   anger: number;
   irritability: number;
   recursion: number;
   calmdown: number;
   conversationTimeLimit: number;
   conversationMemoryLength: number;
}
interface Chatbot {
   respondsTo: RegExp;
   name: string;
   brain: MarkovChain;
   trainerFile: string;
   brainFile: string;
   settings: ChatbotSettings;
   logger: Function;
   loadTrainer(file: string): void;
   loadBrain(file: string): void;
   saveBrain(file: string): void;
   processInput(
      input: string,
      forceRespond?: boolean,
      forceSeed?: string,
      recursion?: number
   ): string;
}
class Chatbot implements Chatbot {
   constructor(
      respondsTo: RegExp = /chatbot['s:]*\s*/i,
      name: string = "chatbot",
      brain: MarkovChain = new MarkovChain(3),
      trainerFile: string = "./chatbot.trn",
      brainFile: string = "./chatbot.brn",
      settings: ChatbotSettings = {
         outburst: 0.015,
         responsiveness: 1,
         anger: 0.5,
         irritability: 1.1,
         recursion: 2,
         calmdown: 2,
         conversationTimeLimit: 5,
         conversationMemoryLength: 600,
      },
      logger: Function = console.log
   ) {
      this.respondsTo = respondsTo;
      this.name = name;
      this.brain = brain;
      this.trainerFile = trainerFile;
      this.brainFile = brainFile;
      this.settings = settings;
      this.logger = logger;
   }
   loadTrainer(file: string = this.trainerFile): void {
      try {
         this.logger(`Loading trainer ${file}`, 'bot-message');
         if (fs.existsSync(file)) {         
            const trainerData: string = fs.readFileSync(file, 'utf8');
            this.brain.learn(trainerData.toLowerCase());
         } else {
            this.logger(`Trainer file ${file} not found. Brain is empty.`);
         }
      } catch (err) {
         this.logger(`Error loading trainer file ${file}: ${err}`);
      }
      return;
   }

   loadBrain(file: string = this.brainFile): void {
      try {
         this.logger(`Loading brain file ${file}`, 'bot-message');
         if (fs.existsSync(file)) {         
            this.brain.deserialize(fs.readFileSync(file, 'utf8'));
         } else {
            this.logger(`Brain file ${file} not found. Attempting to load trainer.`);
            this.loadTrainer();
         }
         this.logger(`Brain file ${file} loaded successfully`, 'bot-message');
      } catch (err) {
         this.logger(`Error loading brain file ${file}: ${err}`, 'error');
         if (process.env.NODE_ENV === "development") throw new Error(err);
      }
      return;
   }

   saveBrain(file: string = this.brainFile): void {      
      try {
         this.logger(`Saving brain ${file}`, 'bot-message');
         fs.writeFileSync(file, this.brain.serialize(), 'utf8');
         this.logger(`Brain file ${file} saved successfully`, 'bot-message');
      } catch (err) {
         this.logger(`Error saving brain file ${file}: ${err}`, 'error');
      }
      return;
   }
   normalizeInput(input: string = ""): string {
      if (!input) return "";
      if (input.toUpperCase() === input) {
         this.settings.anger *= this.settings.irritability;
      } else {
         this.settings.anger = Math.max(0.0001, this.settings.anger / Math.max(0.0001, this.settings.calmdown));
      }
      return this.balance(input.normalize().replace(this.respondsTo, "").replace(this.name, "my friend"));
   }
   processInput(
      input: string = "",
      shouldReply: boolean = false,
      seed: string = "",
      recursion: number = this.settings.recursion      
   ): string {
      // Read the input, learn it, and reply if appropriate
      let response: string = "", wasMentioned: boolean, shouldOutburst: boolean;
      if (!input) return "";
                  
      input = this.normalizeInput(input);
      this.brain.learn(input);
      if (!seed) seed = this.brain.getSeedFromText(input);

      wasMentioned = input.match(this.respondsTo) !== null;
      shouldOutburst = (this.settings.outburst > Math.random()) || (this.settings.anger > Math.random());
      shouldReply = shouldReply || wasMentioned || shouldOutburst;
     
      if (shouldReply) {
         for (let i = 0; i < recursion; i++) {            
            response = this.brain.getReply(seed).trim();            
            this.logger(`Iteration ${i}; Seed: ${seed}; Raw Sentence: ${response}`, 'bot-message');
            seed = this.brain.getSeedFromText(response);            
         }
      }      
      return this.normalizeReply(response);
   }

   normalizeReply(normalizedReply: string = ""): string {
      if (!normalizedReply) return "";
      normalizedReply = normalizedReply.normalize();
      // Apply settings modifiers
      if (this.settings.anger > Math.random()) normalizedReply = normalizedReply.toUpperCase();      
      
      return this.balance(normalizedReply.trim());
   }

   balance(text: string = ""): string {
      // Balances quotation marks
      if (!text) return "";
      let balancedText = text;

      const punctuation = text.match(/\.\?\!$/);
      if (punctuation) text = text.substring(0, [...text].length - 1);
      const characters = [...text], pairedCharString = '()[]{}"`';
      let pairedCharacters: { [char: string]: number } = {};
      [...pairedCharString].map(char => pairedCharacters[char] = 0);

      let curly = 0, square = 0, parenthesis = 0, doubleQuote = false, angledQuote = false;
      characters.forEach(char => {
         for (let findChar of pairedCharString) {
            if (char === findChar) pairedCharacters[findChar]++
         }
      });
      parenthesis = pairedCharacters[')'] - pairedCharacters['('];
      square = pairedCharacters[']'] - pairedCharacters['[']; 
      curly = pairedCharacters['}'] - pairedCharacters['{'];
      doubleQuote = (pairedCharacters['"'] % 2)  === 1;
      angledQuote = (pairedCharacters['`'] % 2) === 1;

      if (parenthesis < 0) balancedText = '('.repeat(-parenthesis).concat(balancedText);
      if (parenthesis > 0) balancedText = balancedText.concat(')'.repeat(parenthesis));
      if (square < 0) balancedText = '['.repeat(-square).concat(balancedText);
      if (square > 0) balancedText = balancedText.concat(']'.repeat(square));
      if (curly < 0) balancedText = '{'.repeat(-curly).concat(balancedText);
      if (curly > 0) balancedText = balancedText.concat('}'.repeat(curly));
      if (doubleQuote) balancedText = balancedText.concat('"');
      if (angledQuote) balancedText = balancedText.concat('`');
      if (punctuation) balancedText = balancedText.concat(punctuation[0]);
      return balancedText.replace(/^[^\[\(\{\"\`\S]/, '') + '\n';      
   }
}
export default Chatbot;
