import Chatbot from './chatbot';
import readline from 'readline';
import chalk from 'chalk';


let bot: Chatbot = new Chatbot();

console.log(chalk.red(`Loading from brain file ${chalk.redBright(bot.brainFile)}`));
bot.loadBrain(bot.brainFile);

let rl = readline.createInterface({
   input: process.stdin,
   output: process.stdout
});

rl.setPrompt(chalk.red('> '));
rl.prompt();
rl.on('line', (line: string) => {
   let input: string = line.trim();
   if (/^\![exit|quit]/i.test(input)) {
      rl.close();
   }
   let reply: string = bot.processInput(input, true);
   if (reply !== '') console.log(chalk.blue('- ') + chalk.blueBright(reply));
   rl.prompt();
})
.on('close', () => {
   console.log(chalk.red('Saving brain and exiting...'));
   bot.saveBrain();      
   process.exit(0);
});

