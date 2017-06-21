import {Observable} from "rxjs/Observable";

export interface AppTabData {
    id: string;
    dataSource: "local" | "public" | "app";
    parsedContent: any;
    fileContent: Observable<string>;
    isWritable: boolean;
    resolve: (content: string) => Observable<Object>;
    language: "json" | "yaml" | string;

}
