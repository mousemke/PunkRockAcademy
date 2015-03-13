/**
 * this file should contain functions for sorting the library into 2 seperate
 * json files:
 * * by album
 * * by artist
 */
module.exports = function( PunkRockAcademy )
{
    /**
     * shortcut placeholder
     *
     * @return {void}
     */
    PunkRockAcademy.prototype.lib = function()
    {
        return true;
    };


    /**
     * auto imports any json file dropped in the import directory
     *
     * @return {void}
     */
    PunkRockAcademy.prototype.lib.byArtist = function()
    {
        if ( this.full )
        {
            // sort this.full into this.artists
            // save into json
        }
        else
        {
            console.log( 'sorry, there\'s no library to sort.  you should have tried harder' );
        }
    };


};