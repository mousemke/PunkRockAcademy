
/* global document, window, µ, require, console, setTimeout */
/*jshint globalstrict: true*/
'use strict';

/**
 * Punk Rock Academy
 *
 * This project is designed not only to catalog peoples favorite music, but also
 * to see the influential 'classics' in other peoples world, and why they affected
 * the people as they did.
 *
 * Contains general functions for starting the academy, as
 * well as holding some app wide variables
 *
 * @author  Mouse Braun <mouse@knoblau.ch>
 */
var PunkRockAcademy = function()
{
    /**
     * load tools
     */
    this.url    = require( 'url' );
    this.fs     = require( 'fs' );
    this.http   = require( 'http' );

    /*
     * load config file
     */
    this.config = require( './config/' );

    /*
     * loads the library tools
     */
    this.lib    = require( './lib/lib' );

    var self    = this;

    /**
     * http server
     */
    this.server = this.http.createServer( function( request, response )
    {
        if ( request.method === 'POST' )
        {
            var body = '';

            request.on( 'data', function( data )
            {
                body += data;
            } );

            request.on( 'end', function()
            {
                body = JSON.parse( body );

                response.writeHead(
                    "200",
                    "OK",
                    {
                        "access-control-allow-origin": request.headers.origin || '*',
                        "content-type": "application/json",
                        "content-length": body.length
                    }
                );

                response.write( 'the goggles do nothing!!!!!!' );

                response.end( 'success' );
            } );

            request.on( 'error', function( e )
            {
                console.log( 'problem with request: ' + e.message );
            } );
        }
        else if ( request.method === 'GET' )
        {
            var variables   = self.url.parse( request.url, true ).query;
            var pathname    = self.url.parse( request.url ).pathname;
            self.loadData( 'library', function( data, filename )
            {
                self.outputData( response, data );
            } );
        }
    } );

    this.ini();

    return this;
};


/**
 * Start the things! - initiates the server and watches sockets
 *
 * @return {void}
 */
PunkRockAcademy.prototype.ini = function()
{
    var port = this.config.serverPort;

    this.server.listen( port );
    console.log( 'Server is started on port ' + ( port ) );
    this.watchSockets();

    this._importJSON();
};


/**
 * auto imports any json file dropped in the import directory
 *
 * @return {void}
 */
PunkRockAcademy.prototype._importJSON = function()
{
    this.fs.readdir( this.config.importDir, function( err, files )
    {
        if ( files.length )
        {
            var file, ext;
            for ( var i = 0, lenI = files.length; i < lenI; i++ )
            {
                file    = files[ i ];
                ext     = file.split( '.' );
                ext     = ext[ ext.length - 1 ];

                if ( ext === 'json' )
                {
                    console.log( 'load file ' + file );
                    console.log( 'integrate file' );
                    console.log( 'move file to .imported' );
                }
            }
        }
    } );
};


/**
 * kills the server after a timeout
 *
 * @param  {int}                    timeout             timeout in seconds
 *
 * @return {void}
 */
PunkRockAcademy.prototype.kill = function( timeout )
{
    timeout     = timeout || 10;
    var self    = this;

    ( function countDown ( counter )
    {
        console.log( counter );
        if ( counter > 0 )
        return setTimeout( countDown, 1000, counter - 1 );

        self.server.close( function () { console.log( 'Server closed' ); } );

        for ( var socketId in self.sockets )
        {
            console.log( 'socket ' + socketId + ' destroyed' );
            self.sockets[ socketId ].destroy();
        }
    } )( timeout );
};


/**
 * loads the json for a passed filename
 *
 * @param  {obj}                    jsonData            json data recieved from page
 * @param  {func}                   _saveFile           savefile function
 *
 * @return {void}
 */
 PunkRockAcademy.prototype.loadData = function( filename, _callback )
{
    this.fs.readFile( 'lib/json/' + filename + '.json', 'utf8', function( err, data )
    {
        if ( !data || err )
        {
            console.log( err );
        }
        else
        {
            data = JSON.parse( data );

            _callback( data, filename );
        }
    } );
};


/**
 * outputs the supplied data as an http response
 *
 * @param  {obj}                    response            http response object
 * @param  {obj}                    request             http request object
 *
 * @return {void}
 */
 PunkRockAcademy.prototype.outputData = function( response, data )
{
    if ( typeof data !== 'string' )
    {
        data = JSON.stringify( data );
    }

    response.writeHead( 200, {
                                'Content-Type': 'application/json',
                                'Access-Control-Allow-Origin': '*'
                            } );
    response.write( data );
    response.end();
};


/**
 * saves the recieved json to a file
 *
 * @param  {obj}                    jsonData            json event data
 * @param  {str}                    fileName            filename to save to
 *
 * @return {void}
 */
 PunkRockAcademy.prototype.saveData = function( jsonData, fileName )
{
    if ( typeof jsonData !== 'string' )
    {
        jsonData = JSON.stringify( jsonData );
    }

    this.fs.writeFile( 'lib/json/' + fileName + '.json', jsonData, function( err )
    {
        if ( err )
        {
            return console.log( err );
        }
    });
};


/**
 * watches and closes web sockets
 *
 * @return {void}
 */
 PunkRockAcademy.prototype.watchSockets = function()
{
    this.sockets         = {};
    this.nextSocketId    = 0;
    var self = this;

    this.server.on( 'connection', function( socket )
    {
      var socketId              = self.nextSocketId++;
      self.sockets[ socketId ]  = socket;

      console.log( 'socket ' + socketId + ' opened' );

      socket.once( 'close', function ()
      {
        console.log( 'socket ' + socketId + ' closed' );
        delete self.sockets[ socketId ];
      });

      socket.setTimeout( 4000 );
    });
};


var punkrockacademy = new PunkRockAcademy();


