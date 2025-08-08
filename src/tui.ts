import * as p from '@clack/prompts';
import chalk from 'chalk';
import { loadSettings, saveSettings, type Settings } from './config';

const COLOR_OPTIONS = [
  { value: 'black', label: chalk.black('black') },
  { value: 'red', label: chalk.red('red') },
  { value: 'green', label: chalk.green('green') },
  { value: 'yellow', label: chalk.yellow('yellow') },
  { value: 'blue', label: chalk.blue('blue') },
  { value: 'magenta', label: chalk.magenta('magenta') },
  { value: 'cyan', label: chalk.cyan('cyan') },
  { value: 'white', label: chalk.white('white') },
  { value: 'gray', label: chalk.gray('gray') },
  { value: 'redBright', label: chalk.redBright('redBright') },
  { value: 'greenBright', label: chalk.greenBright('greenBright') },
  { value: 'yellowBright', label: chalk.yellowBright('yellowBright') },
  { value: 'blueBright', label: chalk.blueBright('blueBright') },
  { value: 'magentaBright', label: chalk.magentaBright('magentaBright') },
  { value: 'cyanBright', label: chalk.cyanBright('cyanBright') },
  { value: 'whiteBright', label: chalk.whiteBright('whiteBright') },
];

function previewStatusLine(settings: Settings): string {
  const elements: string[] = [];
  
  if (settings.elements.model) {
    const modelColor = (chalk as any)[settings.colors.model] || chalk.white;
    elements.push(modelColor('Model: Claude'));
  }
  
  if (settings.elements.gitBranch) {
    const branchColor = (chalk as any)[settings.colors.gitBranch] || chalk.white;
    elements.push(branchColor('Branch: main'));
  }
  
  const separatorColor = (chalk as any)[settings.colors.separator] || chalk.dim;
  return elements.join(separatorColor(' | '));
}

export async function runTUI() {
  let settings = await loadSettings();
  
  console.clear();
  p.intro(chalk.bold.cyan('🎨 CCStatusline Configuration'));
  
  let continueLoop = true;
  
  while (continueLoop) {
    console.log('\n' + chalk.dim('Current preview:'));
    console.log('  ' + previewStatusLine(settings) + '\n');
    
    const action = await p.select({
      message: 'What would you like to configure?',
      options: [
        { value: 'elements', label: '🔧 Toggle Elements' },
        { value: 'colors', label: '🎨 Configure Colors' },
        { value: 'save', label: '💾 Save & Exit' },
        { value: 'exit', label: '❌ Exit without saving' },
      ],
    });
    
    if (p.isCancel(action)) {
      continueLoop = false;
      break;
    }
    
    switch (action) {
      case 'elements':
        console.clear();
        p.intro(chalk.bold.cyan('🎨 CCStatusline Configuration'));
        console.log('\n' + chalk.dim('Current preview:'));
        console.log('  ' + previewStatusLine(settings) + '\n');
        const selectedElements = await p.multiselect({
          message: 'Select which elements to display:',
          options: [
            { 
              value: 'model', 
              label: 'Model',
              hint: settings.elements.model ? 'currently enabled' : 'currently disabled'
            },
            { 
              value: 'gitBranch', 
              label: 'Git Branch',
              hint: settings.elements.gitBranch ? 'currently enabled' : 'currently disabled'
            },
          ],
          initialValues: Object.entries(settings.elements)
            .filter(([_, enabled]) => enabled)
            .map(([key, _]) => key),
          required: false,
        });
        
        if (!p.isCancel(selectedElements)) {
          settings.elements.model = selectedElements.includes('model');
          settings.elements.gitBranch = selectedElements.includes('gitBranch');
        }
        console.clear();
        p.intro(chalk.bold.cyan('🎨 CCStatusline Configuration'));
        break;
        
      case 'colors':
        console.clear();
        p.intro(chalk.bold.cyan('🎨 CCStatusline Configuration'));
        console.log('\n' + chalk.dim('Current preview:'));
        console.log('  ' + previewStatusLine(settings) + '\n');
        const colorElement = await p.select({
          message: 'Which element color to configure?',
          options: [
            { value: 'model', label: 'Model' },
            { value: 'gitBranch', label: 'Git Branch' },
            { value: 'separator', label: 'Separator' },
            { value: 'back', label: '← Back' },
          ],
        });
        
        if (!p.isCancel(colorElement) && colorElement !== 'back') {
          console.clear();
          p.intro(chalk.bold.cyan('🎨 CCStatusline Configuration'));
          console.log('\n' + chalk.dim('Current preview:'));
          console.log('  ' + previewStatusLine(settings) + '\n');
          const color = await p.select({
            message: `Select color for ${colorElement}:`,
            options: COLOR_OPTIONS,
            initialValue: settings.colors[colorElement as keyof typeof settings.colors],
          });
          
          if (!p.isCancel(color)) {
            (settings.colors as any)[colorElement] = color;
          }
        }
        console.clear();
        p.intro(chalk.bold.cyan('🎨 CCStatusline Configuration'));
        break;
        
      case 'save':
        await saveSettings(settings);
        p.outro(chalk.green('✅ Settings saved successfully!'));
        continueLoop = false;
        break;
        
      case 'exit':
        p.outro(chalk.yellow('Exited without saving'));
        continueLoop = false;
        break;
    }
  }
}