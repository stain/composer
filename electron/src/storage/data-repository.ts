import * as storage from "electron-storage";
import {LocalRepository} from "./types/local-repository";
import {UserRepository} from "./types/user-repository";
import {RepositoryType} from "./types/repository-type";
import {childOfKind} from "tslint";

export class DataRepository {

    user: UserRepository;
    local: LocalRepository;

    private listeners = {};

    constructor() {
        this.on("update.local.activeCredentials", (activeCredentials: any) => {
            if (activeCredentials) {
                console.log("Switch active user");
                this.loadProfile(activeCredentials.id, new UserRepository(), () => {

                });
            }

        })
    }

    /**
     * Load local and user (if needed) storage files into memory.
     */
    load(callback: (err?: Error, data?: any) => void): void {

        this.loadProfile("local", new LocalRepository(), (err, localData) => {
            if (err) return callback(err);

            this.local = localData;
            if (!localData.activeCredentials) {
                return callback();
            }

            this.loadProfile(localData.activeCredentials.id, new UserRepository(), (err, userData) => {
                if (err) return callback(err);

                this.user = userData;

                callback();
            });
        });
    }

    private update<T extends RepositoryType>(profile: string, data: Partial<T>, callback?: (err?: Error, data?: T) => void) {

        const profilePath = `profiles/${profile}`;
        this.trigger("update", {user: this.user, local: this.local});

        if (profile === "local") {
            Object.assign(this.local, data);
            this.trigger("update.local", this.local);
            storage.set<RepositoryType>(profilePath, this.local, callback);
        } else {
            Object.assign(this.user, data);
            this.trigger(`update.${profile}`, this.user);
            this.trigger(`update.user`, this.user);
            storage.set<RepositoryType>(profilePath, this.user, callback);
        }

        for (let key in data) {
            this.trigger(["update", profile, key].join("."), data[key]);
            this.trigger(["update", "user", key].join("."), data[key]);
        }
    }

    updateLocal(data: Partial<LocalRepository>, callback) {
        this.update("local", data, callback);
    }

    updateUser(data: Partial<UserRepository>, callback) {
        if (this.local.activeCredentials && this.local.activeCredentials.id) {
            this.update(this.local.activeCredentials.id, data, callback);
        }
    }

    /**
     * Sets a listener for an event name
     */
    on(eventType: string, callback: Function): void {

        if (!this.listeners[eventType]) {
            this.listeners[eventType] = [];
        }

        this.listeners[eventType].push(callback);
    }

    /**
     * Read data from a storage file
     */
    private loadProfile<T extends Object>(path = "local", defaultData: T, callback: (err: Error, data?: T) => any): void {

        const filePath = `profiles/${path}.json`;

        storage.isPathExists(filePath, (exists) => {
            if (!exists) {
                storage.set(filePath, defaultData, (err) => {
                    if (err) return callback(err);

                    callback(null, defaultData);
                });
                return;
            }

            storage.get(filePath, callback);

        });
    }

    private trigger(event, data) {
        const eventParts = event.split(".");

        eventParts.forEach((val, index) => {
            const evName = eventParts.slice(0, index + 1).join(".");

            if (this.listeners[evName]) {
                this.listeners[evName].forEach(listener => {
                    listener(data);
                });
            }
        });
    }


}
