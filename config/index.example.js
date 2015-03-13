var config = {
    path                    : '/PunkRockAcademy/',
    serverPath              : 'http://your.web.address',
    serverPort              : 56665,

    importDir               : './import/'
};

var PunkRockAcademy = PunkRockAcademy || null;

if ( PunkRockAcademy )
{
    PunkRockAcademy.prototype.config = config;
}
else
{
    module.exports = config;
}
