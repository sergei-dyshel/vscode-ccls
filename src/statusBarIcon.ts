import { StatusBarAlignment, StatusBarItem, window } from "vscode";
import { Disposable } from "vscode-jsonrpc";
import { LanguageClient } from "vscode-languageclient";
import { cclsChan } from './globalContext';
import { dedent, unwrap } from './utils';

interface CclsInfoResponse {
  db: {
    files: number;
    funcs: number;
    types: number;
    vars: number;
  };
  pipeline: {
    lastIdle: number;
    completed: number;
    enqueued: number;
  };
  project: {
    entries: number;
  };
}

export class StatusBarIconProvider implements Disposable {
  private icon: StatusBarItem;
  private timer: NodeJS.Timer;
  private wasError = false;

  public constructor(private client: LanguageClient, private updateInterval: number) {
    this.icon = window.createStatusBarItem(StatusBarAlignment.Right);
    this.icon.text = "ccls: loading";
    this.icon.tooltip = "ccls is starting / loading project metadata";
    this.icon.show();

    this.timer = setInterval(this.updateStatus.bind(this), updateInterval);
  }

  public dispose() {
    clearInterval(this.timer);
    this.icon.dispose();
  }

  public inError() { return this.wasError; }

  private async updateStatus() {
    let info: CclsInfoResponse;
    try {
      info = await this.client.sendRequest<CclsInfoResponse>("$ccls/info");
      this.wasError = false;
    } catch (e) {
      if (this.wasError)
        return;
      this.wasError = true;
      this.icon.text = "ccls: error";
      this.icon.color = "red";
      this.icon.tooltip = "Failed to perform info request: " + (e as Error).message;
      return;
    }
    const lastIdle = info.pipeline.lastIdle || 0;
    const completed = info.pipeline.completed || 0;
    const enqueued = info.pipeline.enqueued || 0;
    if (enqueued === completed) {
      this.icon.color = "";
      this.icon.text = 'ccls: idle';
    } else {
      this.icon.color = "yellow";
      this.icon.text = `ccls: ${enqueued - completed} jobs`;
    }
    this.icon.tooltip = `${info.db.files} files,
${info.db.funcs} functions,
${info.db.types} types,
${info.db.vars} variables,
${info.project.entries} entries in project.

completed ${completed}/${enqueued} index requests
last idle: ${lastIdle}`;
  }
}
