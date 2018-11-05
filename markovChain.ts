const MAX_STACK_SIZE = 128;
const CHAR_JOINER = '│';
interface nGram {
   tokens: string[];
   canStart: boolean;
   canEnd: boolean;
   hash: string;   
   frequency: number;
}
interface Token {
   frequency: number;
   ngrams: nGram[];
}
export default class MarkovChain {
   chainLength: number;
   lexicon: { [word: string]: Token } 
   nGramMap: { [hash: string]: nGram };
   nextTokenSet: { [hash: string]: string[] };
   previousTokenSet: { [hash: string]: string[] };
   
   static wordRegex: RegExp = /\s+/u;
   static sentenceRegEx: RegExp = /\n/u;
   static tokenize(text: string = ""): string[] {
      if (!text) return [];
      const results = text.normalize().trim().split(MarkovChain.wordRegex);
      return results;
   }
   static choose(array: string[] = []): string {
      const l = [...array].length;
      if (l === 0) return "";
      return array[Math.floor(Math.random() * l)];
   }
   static surprise(wordWeights: { [key: string]: number } = {}, word: string = "") {
      // returns how likely it is to find 'word' in 'wordWeights' (assuming a key/value pair where wordWeights[word] = weight)
      if (!word || !wordWeights) return 0;      
      const values = Object.keys(wordWeights).map(key => wordWeights[key]);
      const total = values.reduce((accumulator, value) => accumulator + value, 0);      
      return -1 * Math.log(wordWeights[word] / total) / Math.LN2;      
   }
   constructor(chainLength: number = 3) {
      this.chainLength = chainLength;
      this.lexicon = {};
      this.nGramMap = {};
      this.nextTokenSet = {};
      this.previousTokenSet = {};

   }
   serialize(): string {
      return JSON.stringify([this.lexicon, this.nGramMap, this.nextTokenSet, this.previousTokenSet, this.chainLength]);      
   }
   deserialize(serialized: string): void {
      [this.lexicon, this.nGramMap, this.nextTokenSet, this.previousTokenSet, this.chainLength] = JSON.parse(serialized);
   }
   addNGram(ngram: nGram): void {      
      if (!this.nGramMap[ngram.hash]) {
         ngram.frequency = 1;
         this.nGramMap[ngram.hash] = ngram;
      } else {
         ngram.frequency = ++this.nGramMap[ngram.hash].frequency;
      }
   }
   learn(text: string = ""): string[] {
      if (!text) return [];      

      let sentenceCounter: number, tokenCounter: number, prevToken: string, nextToken: string, tokenSet: string[], newNGram: nGram;
   
      const results: string[] = [];
      const sentences = text.normalize().trim().split(MarkovChain.sentenceRegEx);
      
      for (sentenceCounter = 0; sentenceCounter < sentences.length; sentenceCounter++) {
         
         tokenSet = MarkovChain.tokenize(sentences[sentenceCounter].trim());         
         if (tokenSet.length < this.chainLength) continue;
                  
         for (tokenCounter = 0; tokenCounter < tokenSet.length - (this.chainLength - 1); tokenCounter++) {
            let tokenSlice = tokenSet.slice(tokenCounter, tokenCounter + this.chainLength);
            newNGram = {
               tokens: tokenSlice,
               canStart: tokenCounter === 0,
               canEnd: tokenCounter === tokenSet.length - this.chainLength,
               hash: tokenSlice.join(CHAR_JOINER),
               frequency: 1
            }
            
            this.addNGram(newNGram);     

            for (let ngramToken = 0; ngramToken < newNGram.tokens.length; ngramToken++) {         
               let token = newNGram.tokens[ngramToken];
               if (!this.lexicon[token] || !this.lexicon[token].ngrams) {
                  this.lexicon[token] = {
                     frequency: 1,
                     ngrams: [newNGram]
                  }
               } else {
                  this.lexicon[token].frequency++;
                  this.lexicon[token].ngrams.push(newNGram);
               }               
            }

            if (tokenCounter > 0) {
               prevToken = tokenSet[tokenCounter - 1];
               if (!this.previousTokenSet[newNGram.hash]) this.previousTokenSet[newNGram.hash] = [];
               if (!(this.previousTokenSet[newNGram.hash].indexOf(prevToken) >= 0)) {
                  this.previousTokenSet[newNGram.hash].push(prevToken);
               }
            }
            
            if (tokenCounter < tokenSet.length - this.chainLength) {
               nextToken = tokenSet[tokenCounter + this.chainLength];
               if (!this.nextTokenSet[newNGram.hash]) this.nextTokenSet[newNGram.hash] = [];
               if (!(this.nextTokenSet[newNGram.hash].indexOf(nextToken) >= 0)) {
                  this.nextTokenSet[newNGram.hash].push(nextToken);                  
                  results.push(nextToken);
               }               
            }
         }
      }
      return results;
   }
   rankNGrams(ngrams: nGram[] = [], findWords: string[] = []): nGram[] {
      // Returns intersection of ngrams[] and findWords[] sorted by total word frequency (0 = rarest; may have multiple 0 weight entries)
      if (ngrams.length === 0 || findWords.length === 0) return [];

      let highestFrequency: number, rankedNGrams: nGram[];
      const foundWords = ngrams.filter(ngram => findWords.indexOf(ngram.tokens[this.chainLength - 1]) !== -1);

      if (!foundWords || foundWords.length === 0) return [];

      highestFrequency = 0;
      rankedNGrams = [];

      foundWords.map(ngram => {
         let combinedFrequency = 0;
         ngram.tokens.forEach(token => combinedFrequency += this.getWordFrequency(token));
         if (combinedFrequency >= highestFrequency) {
            highestFrequency = combinedFrequency;
            rankedNGrams.push(ngram);
         }
      });
      return rankedNGrams;
   }
   getSeedFromText(text: string = ""): string {      
      if (!text) return MarkovChain.choose(Object.keys(this.lexicon));

      let surprise: number, mostSurprising: number, seed: string, tokens: string[], weighted: { [key: string]: number };

      tokens = MarkovChain.tokenize(text.normalize());
      if (tokens.length === 0) return MarkovChain.choose(Object.keys(this.lexicon));;
      
      seed = MarkovChain.choose(tokens);
      weighted = {};

      tokens.forEach(token => weighted[token] = (this.lexicon && this.lexicon[token]) ? this.lexicon[token].frequency : 0);

      mostSurprising = 0;
      tokens.forEach(token => {
         surprise = MarkovChain.surprise(weighted, token);
         if (surprise > mostSurprising) {
            mostSurprising = Math.pow(surprise, 2);
            seed = token;
         }
      });
      return seed;
   }

   getWordFrequency(word: string): number {
      if (!this.lexicon || !this.lexicon[word]) return 0;
      return this.lexicon[word].frequency;
   }
   getReply(seedWord: string = "", defaultReply: string = ""): string {      
      let stackCounter: number;
      if (!seedWord) seedWord = this.getSeedFromText();

      let seedNGrams: string[], nextTokens: string[], reply: string[], prevTokens: string[], currentNGram: nGram, seedHash: string;
      seedNGrams = [];

      if (!this.lexicon[seedWord] || !this.lexicon[seedWord].ngrams) {
         this.lexicon[seedWord] = {
            frequency: 0,
            ngrams: []
         }
         seedNGrams = Object.keys(this.nGramMap);
      } else {
         seedNGrams = this.lexicon[seedWord].ngrams.map(ngram => ngram.hash);         
      }
      if (seedNGrams.length === 0) return defaultReply;
      
      seedHash = MarkovChain.choose(seedNGrams);
      currentNGram = this.nGramMap[seedHash];
      if (!currentNGram) return defaultReply;

      reply = currentNGram.tokens.slice(0);
      stackCounter = 0;
      while (!currentNGram.canEnd && (stackCounter++ < MAX_STACK_SIZE)) {
         nextTokens = this.nextTokenSet[currentNGram.hash];         
         if (!nextTokens) break;
                  
         const nextToken = MarkovChain.choose(nextTokens);
         if (!nextToken || !this.lexicon[nextToken]) break;

         const newTokenSet: string[] = currentNGram.tokens.slice(1, this.chainLength);
         newTokenSet.push(nextToken);         

         const newNGram: nGram = {
            tokens: newTokenSet,
            hash: newTokenSet.join(CHAR_JOINER),
            frequency: 1,
            canStart: false,
            canEnd: false
         };         
         this.addNGram(newNGram);
                   
         currentNGram = this.nGramMap[newNGram.hash];         
         reply.push(nextToken);
      }
      
      currentNGram = this.nGramMap[seedHash];
      stackCounter = 0;
      while (!currentNGram.canStart && (stackCounter++ < MAX_STACK_SIZE)) {
         prevTokens = this.previousTokenSet[currentNGram.hash];
         if (!prevTokens) break;
         
         const previousToken = MarkovChain.choose(prevTokens);
         if (!previousToken || !this.lexicon[previousToken]) break;

         const newTokenSet: string[] = currentNGram.tokens.slice(0, this.chainLength - 1);
         newTokenSet.unshift(previousToken);

         const newNGram: nGram = {
            tokens: newTokenSet,
            hash: newTokenSet.join(CHAR_JOINER),
            canStart: false,
            canEnd: false,
            frequency: 1
         };
         this.addNGram(newNGram);

         currentNGram = this.nGramMap[newNGram.hash];         
         reply.unshift(previousToken);         
      }      
      return reply.join(' ').concat('\n');
   }
}
