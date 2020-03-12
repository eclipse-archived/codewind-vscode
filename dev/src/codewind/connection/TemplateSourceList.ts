import Connection from "./Connection";
import { CLICommandRunner } from "../cli/CLICommandRunner";
import { TemplateSource, SourceEnablement } from "../Types";

export enum SourceProjectStyles {
    CODEWIND = "Codewind",
    APPSODY = "Appsody",
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

    public async getEnabled(): Promise<TemplateSource[]> {
        if (this.templateSources == null) {
            this.templateSources = await this.get();
        }
        return this.templateSources.filter((source) => source.enabled);
    }

    public async getProjectStyles(enabledOnly: boolean = false): Promise<string[]> {
        if (this.templateSources == null) {
            this.templateSources = await this.get();
        }

        return this.templateSources.reduce((styles: string[], source) => {
            if (enabledOnly && !source.enabled) {
                // skip it because it's not enabled
                return styles;
            }
            return styles.concat(source.projectStyles);
        }, []);
    }

    public async add(url: string, name: string, description: string | undefined): Promise<TemplateSource[]> {
        this.templateSources = await CLICommandRunner.addTemplateSource(this.connection.id, url, name, description);
        return this.templateSources;
    }

    public async remove(url: string): Promise<TemplateSource[]> {
        this.templateSources = await CLICommandRunner.removeTemplateSource(this.connection.id, url);
        return this.templateSources;
    }

    public async toggleEnablement(enablement: SourceEnablement): Promise<TemplateSource[]> {
        await this.connection.requester.toggleSourceEnablement(enablement);
        return this.get(true);
    }

    // for https://github.com/eclipse/codewind/issues/1469
    public async hasCodewindSourceEnabled(): Promise<boolean> {
        const templateSources = this.templateSources || await this.get();
        return templateSources
            .filter((source) => source.enabled)
            .some((source) => source.projectStyles.includes(SourceProjectStyles.CODEWIND));
    }
}
