declare module 'colyseus.js' {
  export class Client {
    constructor(url: string);
    create(name: string, options?: any): Promise<any>;
    join(name: string, options?: any): Promise<any>;
    joinById(id: string, options?: any): Promise<any>;
  }
  export type Room = any;
}
