import {app} from "electron";
import * as storage from "electron-storage";
import {LocalRepository} from "./types/local-repository";
import {RepositoryType} from "./types/repository-type";
import {UserRepository} from "./types/user-repository";

const fs = require("fs");

export class DataRepository {

    user: UserRepository   = null;
    local: LocalRepository = new LocalRepository();

    private storageWriteQueue: { [filePath: string]: Function[] } = {};

    private listeners = {};

    constructor() {

        this.on("update.local.activeCredentials", (activeCredentials: any) => {

            // Every credentials change should flush user data until new data is loaded
            this.flushUserData();

            // Don't load if no user is active
            if (!activeCredentials) {
                return;
            }

            this.loadProfile(activeCredentials.id, new UserRepository(), (err, data) => {

                this.user = data;

                Object.keys(this.user).forEach(key => this.trigger(`update.user.${key}`, this.user[key]));

                if (this.profileMatchesActiveUser(activeCredentials.id)) {
                    this.trigger("update.user", this.user);
                }
            });
        });

        this.on("update.local.credentials", () => {
            this.cleanProfiles();
        });
    }

    /**
     * Load local and user (if needed) storage files into memory.
     */
    load(callback: (err?: Error, data?: any) => void): void {

        this.loadProfile("local", new LocalRepository(), (err, localData) => {
            if (err) {
                callback(err);
                return;
            }

            this.local = localData;
            if (!localData.activeCredentials) {
                callback();
                return;
            }

            this.loadProfile(localData.activeCredentials.id, new UserRepository(), (err, userData) => {
                if (err) return callback(err);

                this.user = userData;

                callback();
            });
        });
    }

    updateLocal(data: Partial<LocalRepository>, callback?: (err?: Error, data?: any) => void) {
        this.update("local", data, callback);
    }

    updateUser(data: Partial<UserRepository>, callback?: (err?: Error, data?: any) => void, profileID?) {

        if (profileID) {

            this.update(profileID, data, callback);
            return;
        }

        if (this.local.activeCredentials && this.local.activeCredentials.id) {
            this.update(this.local.activeCredentials.id, data, callback);
            return;
        }

        callback(null);
    }

    /**
     * Sets a listener for an event name
     * @return off function
     */
    on(eventType: string, callback: (result: any) => void): () => void {

        if (!this.listeners[eventType]) {
            this.listeners[eventType] = [];
        }

        const evListeners = this.listeners[eventType];

        evListeners.push(callback);

        return () => {
            const idx = evListeners.indexOf(callback);
            evListeners.splice(idx, 1);
        }
    }

    private flushUserData() {
        this.user = null;

        const demoUser = new UserRepository();
        Object.keys(demoUser).forEach(key => {
            this.trigger(`update.user.${key}`, null);
        });
    }

    private profileExists(profile: string): boolean {
        return this.local.credentials.find(c => c.id === profile) !== undefined;
    }

    private update<T extends RepositoryType>(profile: string, data: Partial<T>, callback?: (err?: Error, data?: T) => void) {

        const profilePath = `profiles/${profile}`;
        this.trigger("update", {user: this.user, local: this.local});

        if (profile === "local") {
            Object.assign(this.local, data);
            this.trigger("update.local", this.local);
            this.enqueueStorageWrite(profilePath, this.local, callback);
        } else {

            // User to update might not be the active user, so we need to check that before emitting this event
            // Also, there might be no active user anymore when fetch gets back, so we need to check that first
            if (this.profileMatchesActiveUser(profile)) {
                // This is the case where updated user is the current user. We can patch the this.user cache

                if (this.user) {
                    Object.assign(this.user, data);
                } else {
                    this.user = Object.assign(new UserRepository(), data);
                }
                this.trigger(`update.user`, this.user);
                this.enqueueStorageWrite(profilePath, this.user, callback);
            } else {
                // If update is for a non-active user, we need to load that user's data and patch that instead
                // However, user might be deleted at the time, so we first need to check that

                // Scenario that we need to cover
                // 1) 2 users, 1st active
                // 2) activate 2nd fast
                // 3) activate 1st fast --> two updates pending
                // 4) remove 1st
                // incoming patch would create this deleted user again if we don't prevent it
                if (!this.profileExists(profile)) {
                    return callback();
                }

                this.loadProfile(profile, new UserRepository(), (err, loadedProfileData) => {
                    if (err) return callback(err);

                    this.trigger(`update.${profile}`, data);
                    this.enqueueStorageWrite(profilePath, Object.assign(loadedProfileData, data), callback);
                });

            }


        }

        for (let key in data) {
            this.trigger(["update", profile, key].join("."), data[key]);

            if (profile !== "local" && this.profileMatchesActiveUser(profile)) {
                this.trigger(["update", "user", key].join("."), data[key]);
            }
        }
    }

    /**
     * Tells whether given profile name represents the currently active credentials
     */
    private profileMatchesActiveUser(profile: string): boolean {
        return this.local.activeCredentials && profile === this.local.activeCredentials.id;
    }

    private getProfileFilePath(profile: string, prefix = app.getPath("userData")): string {
        return [
            prefix,
            `profiles/${profile}.json`
        ].filter(v => v).join("/");
    }

    /**
     * Read data from a storage file
     */
    private loadProfile<T extends Object>(path = "local", defaultData: T, callback: (err: Error, data?: T) => any): void {

        const filePath = this.getProfileFilePath(path, null);
        storage.isPathExists(filePath, (exists) => {
            if (!exists) {
                this.enqueueStorageWrite(filePath, defaultData, (err) => {
                    if (err) return callback(err);

                    callback(null, defaultData);
                });
                return;
            }

            storage.get(filePath, (err, storageContent: T) => {
                if (err) {
                    return callback(err);
                }

                for (let prop in defaultData) {
                    if (!storageContent.hasOwnProperty(prop)) {
                        storageContent[prop] = defaultData[prop];
                    }
                }
                callback(null, storageContent);
            });

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

    private enqueueStorageWrite(filePath, data, callback) {


        if (!this.storageWriteQueue[filePath]) {
            this.storageWriteQueue[filePath] = [];
        }
        const pathQueue = this.storageWriteQueue[filePath];

        const executor = () => {

            const dataClone = JSON.parse(JSON.stringify(data));

            storage.set(filePath, dataClone, (err, data) => {
                if (err) return callback(err);

                callback(null, data);

                pathQueue.shift();

                if (pathQueue.length) {
                    pathQueue[0]();
                }
            });
        };

        if (pathQueue.length === 2) {
            pathQueue[1] = executor;
            return;
        }

        if (pathQueue.length === 1) {
            pathQueue.push(executor);
            return;
        }

        if (pathQueue.length === 0) {
            pathQueue.push(executor);
            pathQueue[0]();
        }
    }

    private cleanProfiles(callback = (err?: Error, data?: any) => {
    }) {
        const profileIDs = this.local.credentials.map(c => c.id);

        fs.readdir(app.getPath("userData") + "/profiles", (err, files) => {
            if (err) {
                return callback(err);
            }

            const deletables = files
                .map(file => file.slice(0, -5)) // remove .json extension
                .filter(profile => profileIDs.indexOf(profile) === -1) // take just the ones not present in profiles
                .map(profile => new Promise((resolve, reject) => {

                    fs.unlink(this.getProfileFilePath(profile), (err, data) => {
                        if (err) {
                            return reject(err);
                        }

                        resolve(data);
                    });
                }));

            Promise.all(deletables).then(r => callback(null, r), callback);
        });
    }
}
