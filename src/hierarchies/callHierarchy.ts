import { CallHierarchyIncomingCall, CallHierarchyItem, CallHierarchyOutgoingCall,
  CallHierarchyProvider as VscodeCallHierarchyProvider, CancellationToken,
  commands, Position, SymbolKind, TextDocument, TreeItem, Uri } from 'vscode';
import { LanguageClient } from 'vscode-languageclient/lib/main';
import { Converter } from 'vscode-languageclient/lib/protocolConverter';
import { Icon, IHierarchyNode } from '../types';
import { resourcePath } from '../utils';
import { Hierarchy } from './hierarchy';

enum CallType {
  Normal = 0,
  Base = 1,
  Derived = 2,
  All = CallType.Base | CallType.Derived // Normal and Base and Derived
}

interface CallHierarchyNode extends IHierarchyNode {
  children: CallHierarchyNode[];
  callType: CallType;
}

class CclsCallHierarchyItem extends CallHierarchyItem {
  public node: CallHierarchyNode;

  constructor(node: CallHierarchyNode, p2c: Converter) {
    const range = p2c.asRange(node.location.range);
    super(
        SymbolKind.Function, node.name, '', Uri.parse(node.location.uri), range,
        range);
    this.node = node;
  }
}

function groupArray<T>(arr: T[], func: (x: T, y: T) => boolean) {
  return arr.reduce<T[][]>((prev: T[][], cur: T) => {
    if (prev.length === 0 || !func(prev[prev.length - 1][0], cur)) {
      prev.push([cur]);
    } else {
      prev[prev.length - 1].push(cur);
    }
    return prev;
  }, []);
}
export class NewCallHierarchyProvider implements VscodeCallHierarchyProvider {
  constructor(private languageClient: LanguageClient) {}

  public async prepareCallHierarchy(
      document: TextDocument, position: Position,
      token: CancellationToken): Promise<CclsCallHierarchyItem> {
    const node =
        await this.languageClient.sendRequest<CallHierarchyNode>('$ccls/call', {
          callType: CallType.All,
          callee: true,
          hierarchy: true,
          levels: 0,
          position,
          qualified: true,
          textDocument: {
            uri: document.uri.toString(true),
          },
        });
    return new CclsCallHierarchyItem(
        node, this.languageClient.protocol2CodeConverter);
  }

  public async provideCallHierarchyIncomingCalls(
      item: CallHierarchyItem,
      token: CancellationToken): Promise<CallHierarchyIncomingCall[]> {
    const node = (item as CclsCallHierarchyItem).node;
    const nodeWithChildren =
        await this.getChildren(node, false);
    const groupedChildren = groupArray(nodeWithChildren.children, (node1, node2) => {
      return node1.id === node2.id;
    });
    const results = groupedChildren.map((nodes) => {
      const childItem = new CclsCallHierarchyItem(
          nodes[0], this.languageClient.protocol2CodeConverter);
      const useRanges = nodes.map(
          (groupedNode) => this.languageClient.protocol2CodeConverter.asRange(
              groupedNode.useRange));
      return new CallHierarchyIncomingCall(childItem, useRanges);
    });
    return results;
  }

  public async provideCallHierarchyOutgoingCalls(
      item: CallHierarchyItem,
      token: CancellationToken): Promise<CallHierarchyOutgoingCall[]> {
    const node = (item as CclsCallHierarchyItem).node;
    const result =
        await this.getChildren(node, true);
    return result.children.map(
        (child) => new CallHierarchyOutgoingCall(
            new CclsCallHierarchyItem(
                child, this.languageClient.protocol2CodeConverter),
            []));
  }

  private async getChildren(node: CallHierarchyNode, callee: boolean):
      Promise<CallHierarchyNode> {
    return this.languageClient.sendRequest<CallHierarchyNode>('$ccls/call', {
      callType: CallType.All,
      callee,
      hierarchy: true,
      id: node.id,
      levels: 1,
      qualified: true,
    });
  }
}

export class CallHierarchyProvider extends Hierarchy<CallHierarchyNode> {
  protected contextValue: string = 'extension.ccls.callHierarchyVisible';
  private baseIcon: Icon;
  private derivedIcon: Icon;
  private useCallee = false;
  private qualified = false;

  constructor(languageClient: LanguageClient, qualified: boolean) {
    super(languageClient, 'ccls.callHierarchy', 'ccls.closeCallHierarchy');
    this.baseIcon = {
      dark: resourcePath("base-dark.svg"),
      light: resourcePath("base-light.svg")
    };
    this.derivedIcon = {
      dark: resourcePath("derived-dark.svg"),
      light: resourcePath("derived-light.svg")
    };
    this.qualified = qualified;
    this._dispose.push(commands.registerCommand("ccls.call.useCallers", () => this.updateCallee(false)));
    this._dispose.push(commands.registerCommand("ccls.call.useCallees", () => this.updateCallee(true)));
  }

  public onTreeItem(ti: TreeItem, element: CallHierarchyNode) {
    if (element.callType === CallType.Base)
      ti.iconPath = this.baseIcon;
    else if (element.callType === CallType.Derived)
      ti.iconPath = this.derivedIcon;
  }

  protected async onGetChildren(element: CallHierarchyNode): Promise<CallHierarchyNode[]> {
    const result =
        await this.languageClient.sendRequest<CallHierarchyNode>('$ccls/call', {
          callType: CallType.All,
          callee: this.useCallee,
          hierarchy: true,
          id: element.id,
          levels: 1,
          qualified: this.qualified,
        });
    element.children = result.children;
    return result.children;
  }

  protected async onReveal(uri: Uri, position: Position): Promise<CallHierarchyNode> {
    return this.languageClient.sendRequest<CallHierarchyNode>('$ccls/call', {
      callType: CallType.All,
      callee: this.useCallee,
      hierarchy: true,
      levels: 2,
      position,
      qualified: this.qualified,
      textDocument: {
        uri: uri.toString(true),
      },
    });
  }

  private updateCallee(val: boolean) {
    this.useCallee = val;
    if (this.root) {
      this.root.children = [];
      this.onDidChangeEmitter.fire();
    }
  }
}
