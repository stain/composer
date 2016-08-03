import {
    Component,
    Input,
    trigger,
    style,
    animate,
    state,
    transition
} from "@angular/core";
import {FormBuilder, ControlGroup} from "@angular/common";
import {REACTIVE_FORM_DIRECTIVES, FORM_DIRECTIVES} from "@angular/forms";
import {FileModel} from "../../store/models/fs.models";
import {GuiEditorService} from "./gui-editor.service";
import {EditorSidebarComponent} from "./sidebar/editor-sidebar.component";
import {FormPosition, VisibilityState} from "./animation.states";
import {CommandLineComponent} from "./commandline/commandline.component";
import {DockerInputFormComponent} from "../forms/inputs/forms/docker-input-form.component";
import {BaseCommandFormComponent} from "../forms/inputs/forms/base-command-form.component";

require("./gui-editor.component.scss");

@Component({
    selector: "gui-editor",
    providers: [GuiEditorService],
    directives: [
        DockerInputFormComponent,
        BaseCommandFormComponent,
        EditorSidebarComponent,
        CommandLineComponent,
        REACTIVE_FORM_DIRECTIVES,
        FORM_DIRECTIVES
    ],
    animations: [
        trigger("formPosition", [
            state("left", style({
                margin: '20px 0 0 0'
            })),
            state("center", style({
                margin: '20px auto'
            })),
            transition("hidden => visible", animate("100ms ease-in")),
            transition("visible => hidden", animate("100ms ease-out"))
        ])
    ],
    template: `
            <form (ngSubmit)="onSubmit()"  [formGroup]="guiEditorFromControl">
            
                <docker-input-form @formPosition="formPosition"
                                class="input-form" 
                                [control]="guiEditorFromControl"
                                [dockerPull]="'some.docker.image.com'"></docker-input-form>
                                
                <base-command-form @formPosition="formPosition"
                                class="input-form" 
                                [control]="guiEditorFromControl"
                                [baseCommand]="'echo'"></base-command-form>
            </form>
                  
            <editor-sidebar (sidebarVisibility)="togglePropertyPosition($event)"></editor-sidebar>
          
            <div class="footer">
                <commandline [content]="commandlineContent"></commandline>
            </div>
    `
})
export class GuiEditorComponent {
    /** The file that we are going to use to list the properties*/
    @Input()
    private file: FileModel;

    /** Positions of the listed properties */
    private formPosition: FormPosition = "center";

    /* TODO: generate the commandline */
    private commandlineContent: string = "This is the command line";

    /** ControlGroup that encapsulates the validation for all the nested forms */
    private guiEditorFromControl: ControlGroup;

    constructor(private formBuilder: FormBuilder) {
        this.guiEditorFromControl = this.formBuilder.group({});
    }

    togglePropertyPosition(sidebarVisibility: VisibilityState) {
        this.formPosition = sidebarVisibility === "hidden" ? "center": "left";
    }
}
