import Connection from "./Connection";
import { CLICommandRunner } from "./CLICommandRunner";
import { ISourceEnablement } from "../../command/webview/SourcesPageWrapper";
import Requester from "../project/Requester";

const CODEWIND_PROJECT_STYLE = "Codewind";

/**
 * Template repository/source data as provided by the backend
 */
export interface TemplateSource {
    readonly url: string;
    readonly name?: string;
    readonly description?: string;
    readonly enabled: boolean;
    readonly projectStyles: string[];
    readonly protected: boolean;
}

export default class TemplateSourcesList {

    private templateSources: TemplateSource[] | undefined;

    private hasInitialized: boolean = false;

    constructor(
        public readonly connection: Connection,
    ) {

    }

    public toString(): string {
        if (this.templateSources == null) {
            return `Uninitialized TemplateSourcesList`;
        }
        return this.templateSources.toString();
    }

    public async get(refresh: boolean = false): Promise<TemplateSource[]> {
        if (this.templateSources == null || refresh) {
            this.templateSources = await CLICommandRunner.getTemplateSources(this.connection.id, this.hasInitialized);
            this.hasInitialized = true;
        }
        return this.templateSources;
    }

    public async add(url: string, name: string, description: string | undefined): Promise<TemplateSource[]> {
        this.templateSources = await CLICommandRunner.addTemplateSource(this.connection.id, url, name, description);
        return this.templateSources;
    }

    public async remove(url: string): Promise<TemplateSource[]> {
        this.templateSources = await CLICommandRunner.removeTemplateSource(this.connection.id, url);
        return this.templateSources;
    }

    public async toggleEnablement(enablement: ISourceEnablement): Promise<TemplateSource[]> {
        await Requester.toggleSourceEnablement(this.connection, enablement);
        return this.get(true);
    }

    // for https://github.com/eclipse/codewind/issues/1469
    public async hasCodewindSourceEnabled(): Promise<boolean> {
        const templateSources = this.templateSources || await this.get();
        return templateSources
            .filter((source) => source.enabled)
            .some((source) => source.projectStyles.includes(CODEWIND_PROJECT_STYLE));
    }
}
