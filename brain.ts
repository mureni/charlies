enum PartOfSpeech {
   Noun, Verb, Adverb, Adjective, Pronoun, Preposition, Article, ProperNoun, Unknown
}
interface WordMetadata {
   partOfSpeech: PartOfSpeech;
   isEndPoint: boolean;
   isStartPoint: boolean;
}
interface Word {
   frequency: number;
   metadata?: WordMetadata;
}
interface Subset {
   words: { 
      [key: string]: Word;
   }
   possibleNextWords: {
      [word: string]: {         
         weight: number;
      }
   }
   possiblePreviousWords: {
      [word: string]: {         
         weight: number;
      }
   }
}

interface Brain {
   lexicon: {
      [key: string]: Word;
   }
   subsets: {
      [key: string]: Subset;
   }
   learn(input: string): void;
   generateReply(seed: string): string;
}
//const TOKEN_TERM = '\u200C', TOKEN_JOIN = '\u200B';
const TOKEN_EMPTY = '<EMPTY>'//, TOKEN_FENCE = '│';

/*

CURRENT PROBLEMS:
No way for a Subset to produce an actual string of words -- words held in object have no order



========
Learning
--------
- Given a set of words and a chain length:
========

   1) Record each subset of words (size: chain length)
   2) Record the next subset as a possibility
      i) If next subset is entirely empty, record current subset as an "ending" point
      ii) If next subset is partially empty, record next subset as an "ending" point
      iii) If next subset is already in the possibility list, increase its weight
   3) Record the previous subset as a possibility
      i) If previous subset is entirely empty, record current subset as a "starting" point
      ii) If previous subset is partially empty, record previous subset as a "starting" point
      iii) if previous subset is already in the possibility list, increase its weight

   TO CONSIDER:
   a) Rather than record only a word, record also its metadata -- part of speech, frequency, position in sentence, etc.

=======
Generating a Reply
-------
- Given a seed word, generate a sentence 
=======

   1) Determine all subsets that contain seed word
   2) Select random subset as seed subset
      i) If subset is a "starting" point, move forwards only
      ii) If subset is an "ending" point, move backwards only
      iii) If subset is neither, move both forwards and backwards (ALTERNATE: Move backwards until current subset is a "starting" point and go from there)
   3) FORWARDS: With seed subset, select random (or weighted) next subset from possibility list
      i) If next subset is an "ending" point, exit
      ii) If next subset is not an "ending" point, append current subset to reply, set next subset as current subset, and repeat step 3
   4) BACKWARDS: With seed subset, select random (or weighted) previous subset from possibility list
      i) If previous subset is a "starting" point, exit
      ii) If previous subset is not a "starting" point, prepend current subset to reply, set previous subset as current subset, and repeat step 4
   5) Process reply to ensure capitalization, punctuation, brackets, quotes, etc. are matching/balanced as appropriate

*/

class Brain {
   lexicon: {
      [key: string]: Word;
   }
   subsets: {
      [key: string]: Subset;
   }   
   chainLength: number;
   constructor() {
      this.lexicon = {};
      this.subsets = {};
      this.chainLength = 3;      
   }
   subsetKey(slice: string[]) {
      return slice.map(item => item.toLowerCase()).join(' ');
   }
   tokenize(input: string): string[] {
      return input.split(/\s+/).map(token => token.trim().toLowerCase());
   }
   getWordMetadata(word: string, context: string): WordMetadata {
      // Pending functionality
      const words = this.tokenize(context);
      const wordPosition = words.indexOf(word);      
      let metadata: WordMetadata;
      if (wordPosition >= 0) {
         metadata = {
            isStartPoint: wordPosition === 0,
            isEndPoint: wordPosition === words.length - 1,
            partOfSpeech: PartOfSpeech.Unknown
         }
      } else {
         metadata = {
            isEndPoint: false,
            isStartPoint: false,
            partOfSpeech: PartOfSpeech.Unknown
         }
      }
      return metadata;
   }
   addOrGetLexiconWord(word: string, context: string): Word {      
      if (!this.lexicon[word]) {
         this.lexicon[word] = {
            frequency: 0,
            metadata: this.getWordMetadata(word, context)
         }
      }
      return this.lexicon[word];
   }
   learn(input: string): void {
      
      const tokens = this.tokenize(input).filter(token => token.length > 0), numTokens = tokens.length;         

      for (let t = 0; t < numTokens; t++) {
         let previousWord = t === 0 ? TOKEN_EMPTY : tokens[t - 1];
         let currentWord = tokens[t];
         let nextWord = t < numTokens - 1 ? tokens[t + 1] : TOKEN_EMPTY;

         let key = this.subsetKey([previousWord, currentWord]);
         if (!this.subsets[key].possibleNextWords[nextWord]) {
            this.subsets[key].possibleNextWords[nextWord] = { weight: 1 }
         } else {
            this.subsets[key].possibleNextWords[nextWord].weight++;
         }
         if (!this.subsets[key].possiblePreviousWords[previousWord]) {
            this.subsets[key].possiblePreviousWords[previousWord] = { weight: 1 }
         } else {
            this.subsets[key].possiblePreviousWords[previousWord].weight++;
         }

         this.addOrGetLexiconWord(currentWord, input);
         this.lexicon[currentWord].frequency++;



         let currentToken = tokens[t];

         
         let subset = tokens.slice(t, t + this.chainLength - 1);
         while (subset.length < this.chainLength - 1) subset.push(TOKEN_EMPTY);
         let currentKey = this.subsetKey(subset);

         if (!this.subsets[currentKey]) {            
            this.subsets[currentKey] = {               
               possibleNextKeys: {},
               possiblePreviousKeys: {},               
               words: {}
            };
         }
         
         subset.forEach(word => this.subsets[currentKey].words[word] = this.lexicon[word]);

         let nextSlice: string[] = tokens.slice(t + 1, t + this.chainLength + 1);
         while (nextSlice.length < this.chainLength) nextSlice.push(TOKEN_EMPTY);
         let nextKey = this.subsetKey(nextSlice);

         if (!this.subsets[currentKey].possibleNextKeys[nextKey]) {            
            this.subsets[currentKey].possibleNextKeys[nextKey] = {
               word: currentToken,
               frequency: 0
            };
         } else {
            this.subsets[currentKey].possibleNextKeys[nextKey].frequency++;            
         }
         
         let previousSlice: string[];
         if (isStartPoint) {
            previousSlice = tokens.slice(0, this.chainLength - 1);
            previousSlice.unshift(TOKEN_EMPTY);   
         } else {
            previousSlice = tokens.slice(t - 1, t + this.chainLength - 1);
         }
         let previousKey = this.subsetKey(previousSlice);
         if (!this.subsets[currentKey].possiblePreviousKeys[previousKey]) {            
            this.subsets[currentKey].possiblePreviousKeys[previousKey] = {
               word: currentToken,
               frequency: 0
            };
         } else {            
            this.subsets[currentKey].possiblePreviousKeys[previousKey].frequency++;
         }
      }
 
      return;
   }
   generateReply(seed: string): string {
      if (!seed) seed = this.chooseFrom(Object.keys(this.lexicon));
      let response: string[];

      let subsetsContainingSeed = Object.keys(this.subsets).filter(key => this.subsets[key].words[seed]);
      let randomSubset: Subset = this.subsets[this.chooseFrom(subsetsContainingSeed)];
            
      if (randomSubset.isStartPoint) {         
         response = this.walkModel(randomSubset, 'forwards');
      } else if (randomSubset.isEndPoint) {         
         response = this.walkModel(randomSubset, 'backwards');
      } else {
         response = [...this.walkModel(randomSubset, 'backwards'), ...this.walkModel(randomSubset, 'forwards')];
      }

      return response.join(' ');
   }
   walkModel (initialSubset: Subset, direction: 'backwards' | 'forwards'): string[] {      
      let results: string[] = [];
      let walkBackwards = direction === 'backwards';
      let seed = walkBackwards ? nextSubset.
      let nextSubset = initialSubset;
      let atTerminationPoint = walkBackwards ? nextSubset.isStartPoint : nextSubset.isEndPoint;
      let keySet = walkBackwards ? nextSubset.possiblePreviousKeys : nextSubset.possibleNextKeys;
      let subsetsContainingSeed = Object.keys(keySet).filter(key => this.subsets[key] ? this.subsets[key].words[seed] : false);
      let nextKey = this.chooseFrom(subsetsContainingSeed); 

      do {
         if (walkBackwards) {
            results.unshift(seed);
            atTerminationPoint = nextSubset.isStartPoint;
            keySet = nextSubset.possiblePreviousKeys;
         } else {
            results.push(seed);            
            atTerminationPoint = nextSubset.isEndPoint;
            keySet = nextSubset.possibleNextKeys;
         }
         
         subsetsContainingSeed = Object.keys(keySet).filter(key => this.subsets[key] ? this.subsets[key].words[seed] : false);
         nextKey = this.chooseFrom(subsetsContainingSeed);
         nextSubset = this.subsets[nextKey];
         if (!keySet[nextKey]) break;
         // new seed
         seed = keySet[nextKey].word;
         
      } while (!atTerminationPoint);
      return results;
   }
        
   chooseFrom(items: any[]): any {
      return items[~~(Math.random() * items.length)]
   }
}

let testMaterial = [
   "eat my shit dr jones",
   "one time you shit your pants",
   "dr jones can save me from the gorillas",
   "the gorillas are animals",
   "nobody knows the gorillas like dr jones who can save me from the gorillas",
   "the animals like to eat dr jones",
   "one time I shit my pants",
   "dr jones can save you from the gorillas",
   "the gorillas are people",
   "people can save you from dr jones",
   "people can save me from dr jones"
];

const b = new Brain();
testMaterial.forEach(line => b.learn(line));

let forceSeed = "";
let reply = b.generateReply(forceSeed);
console.log(`Reply: ${reply}`);
