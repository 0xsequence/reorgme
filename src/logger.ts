import chalk from 'chalk'
import format from 'date-fns/format'

const logUtil = (output: string) => {
	const timestamp = format(new Date(), 'HH:mm:ss');

	console.log(chalk.dim(`[${timestamp}]`) + ` ${output}`);
}

const renderHelper = (task: any, event: any) => {
	const log = logUtil.bind(undefined);

	if (event.type === 'STATE') {
		const message = task.isPending() ? 'started' : task.state;

		log(`${task.title} [${message}]`);

		if (task.isSkipped() && task.output) {
			log(`-> ${task.output}`);
		}
	} else if (event.type === 'DATA') {
		log(`${task.title} -> ${event.data}`);
	} else if (event.type === 'TITLE') {
		log(`${task.title} [title changed]`);
	}
}

const render = (tasks: any) => {
	for (const task of tasks) {
		task.subscribe(
			(event: any) => {
				if (event.type === 'SUBTASKS') {
					render(task.subtasks);
					return;
				}

				renderHelper(task, event);
			},
			(err: Error) => {
				console.log(err);
			}
		);
	}
};

export class VerboseRenderer2 {
  private _tasks: any

  constructor(tasks: any, options: any) {
		this._tasks = tasks
	}

	static get nonTTY() {
		return true;
	}

	render() {
		render(this._tasks);
	}

  end() {}
}
