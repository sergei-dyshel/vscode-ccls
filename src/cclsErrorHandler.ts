import {StatusBarItem, window, WorkspaceConfiguration} from 'vscode';
import {Message} from 'vscode-jsonrpc';
import {CloseAction, ErrorAction, ErrorHandler} from 'vscode-languageclient';

export class CclsErrorHandler implements ErrorHandler {
  constructor(
      readonly config: WorkspaceConfiguration, readonly status: StatusBarItem) {}

  public error(error: Error, message: Message, count: number): ErrorAction {
    return ErrorAction.Continue;
  }

  public closed(): CloseAction {
    const notifyOnCrash = this.config.get('launch.notifyOnCrash');
    const restart = this.config.get('launch.autoRestart');

    this.status.text = 'ccls: crashed';
    this.status.color = 'red';

    if (notifyOnCrash) {
      window.showInformationMessage(
          restart ? 'ccls has crashed; it has been restarted.' :
                    'ccls has crashed; it has not been restarted.');
    }

    if (restart)
      return CloseAction.Restart;
    return CloseAction.DoNotRestart;
  }
}
