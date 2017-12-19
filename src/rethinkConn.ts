import * as r from 'rethinkdb'
import configs from '@/configs'
import * as fs from 'fs'
import { URL } from 'url'
import { argv } from 'yargs'
import { addTransaction, addBlock } from './dataStore'
import { txLayout, blockLayout } from '@/typeLayouts'


class RethinkDB {
    socketIO: any
    dbConn: r.Connection
    constructor(_socketIO: any) {
        this.socketIO = _socketIO
        this.start()
    }
    start():void  {
        let _this = this
        let conf = configs.global.RETHINK_DB
        let tempConfig: r.ConnectionOptions = {
            host: conf.host,
            port: conf.port,
            db: conf.db
        }
        let connect = (_config: r.ConnectionOptions):void => {
            r.connect(_config, (err: Error, conn: r.Connection): void => {
                if (!err) {
                    _this.dbConn = conn
                    _this.setAllEvents()
                } else {
                    console.log(err)
                }
            })
        }
       let connectWithCert = (_cert: any) => {
            let url = new URL(process.env[conf.env_url])
            tempConfig = {
                host: url.hostname,
                port: parseInt(url.port),
                password: url.password,
                ssl: {
                    ca: _cert
                },
                db: conf.db
            }
            connect(tempConfig)
        }
        if (argv.remoteRDB && !argv.rawCert) {
            fs.readFile(process.env[conf.env_cert], (err, caCert) => {
                connectWithCert(caCert)
            })
        } else if (argv.remoteRDB && argv.rawCert) {
            connectWithCert(process.env[conf.env_cert_raw])
        } else {
            connect(tempConfig)
        } 

    }
    setAllEvents():void  {
        let _this = this
        r.table('blocks').changes().run(_this.dbConn, function(err, cursor) {
            cursor.each((err: Error, row: any) => {
                if (!err) _this.onNewBlock(row.new_val)
            });
        });
    }

    onNewBlock(_block: blockLayout) {
        let _this = this
        let txs = _block.transactions.slice(0)
        this.socketIO.to('blocks').emit('newBlock', _block)
        console.log(_block.hash)
        _block.transactions.forEach((tx: txLayout, idx: number):void => {
            _this.onNewTx(tx)
        })
        addBlock(_block)
    }
    onNewTx(_tx:txLayout) {
        addTransaction(_tx)
    } 
}

export default RethinkDB