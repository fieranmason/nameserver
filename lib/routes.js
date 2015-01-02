'use strict';
var async = require('async'),
    _ = require('lodash'),
    fs = require('fs'),
    logger = require('./logger');

var util = require('util');
var natural = require('natural');
var Random = require('random-js');

var firstThresholdJW = 0.8;
var lastThresholdJW = 0.8;
var trialSize = 5;

/**
 *  * Sets up the standard routes for the application. Check the express documentation on routers.
 * @param  {Function} next The async callback. Signature (error, result)
 * @param  {Object}   data Contains results of the `validators`, `models`, and `httpd` task.
 */
function routes(next, data) {
    var router = new require('express').Router();

    /* Index */
    router.get('/',
        function render(req, res) {
            res.render('index', {
                title: 'Welcome',
                text: 'Hello World!'
            });
        }
    );

    router.get('/getdata',

      function(req, res)
      {
        var https = require('https');
        var str = {};

        //chauffeurs
        https.get('https://data.cityofchicago.org/api/views/97wa-y6ff/rows.json?accessType=DOWNLOAD', callback1).on('error', error);

        function callback1(res2)
        {
          var str1 = '';

          res2.on('data', function(d) {
            str1+=d;
          });

          res2.on('end', function(d) {
            str.people1 = JSON.parse(str1);

            //public employees
            https.get('https://data.cityofchicago.org/api/views/xzkq-xp2w/rows.json?accessType=DOWNLOAD', callback2).on('error', error);

            function callback2(res3)
            {
              var str2 = '';

              res3.on('data', function(d) {
                str2+=d;
              });

              res3.on('end', function(d) {
                str.people2=JSON.parse(str2);
                recordPatients(data);
              });
            }
          });
        }

        function recordPatients(data)
        {
          var PEOPLE1_NAME_INDEX = 15;
          data.people1.data.every(
            function(x)
            {

              var fullName = x[PEOPLE1_NAME_INDEX];
              var nameParts = fullName.split(" ");
              var fileName = fullName + ".mp4";

              var exec = require('child_process').exec;
              exec('say -r 150 "' + fullName + '" -o "/Users/fmason/PatientIdentificationUserStudy/patientId/files/"' + fullName + '"' + ".mp4", function (error, stdout, stderr) {
                // output is in stdout
                console.log("error: " + util.inspect(error));
                console.log("stdout: " + util.inspect(stdout));
                console.log("stderr: " + util.inspect(stderr));
              });
              //say -r 150 "Morgan Price" -o "files/Morgan Price.mp4"

              var Patient = require("../models/patient");
              var patient = new Patient({first:nameParts[0],last:nameParts[nameParts.length-1], file:fileName});
              patient.save(savedPatient);

              function savedPatient(error, data)
              {
                if(error)
                  {
                    console.log(util.inspect(error));
                    return;
                  }
              }
            }
          );

          res.header('Access-Control-Allow-Origin', "*");
          res.json(str);
        }

        function error(e)
        {
          console.error(e);
        }
      }
    );

    router.post('/answers',
      function render(req, res)
      {
        var Answer = require("../models/answer");
        var answer = new Answer(req.body);
        answer.save(savedResponse);

        function savedResponse(error, data)
        {
          if(error)
          {
            console.log(util.inspect(error));
            return;
          }

          res.header('Access-Control-Allow-Origin', "*");
          res.json(answer);
        }
      });
    router.get('/names',
      function render(req, res)
      {
        var seed = require('../');
        var mt = new Random(Random.engines.mt19937().seed('1024'));

        data.models.patient.find().exec(processPatientsLocal);//what to do?

        function processPatientsLocal(err, patients)
        {
          patients = shuffle(patients).slice(0,patients.length>200 ? 200: trialSize);

          res.header('Access-Control-Allow-Origin', "*");
          res.patients = patients;
          processPatients(err, res, "Raw");
        }

        function shuffle(o){ //v1.0
          for(var j, x, i = o.length; i; j = mt.integer(0,i), x = o[--i], o[i] = o[j], o[j] = x);
          return o;
        }//http://stackoverflow.com/questions/6274339/how-can-i-shuffle-an-array-in-javascript
      }
    );

    router.get('/stemming/:first/:last',
      function render(req, res){

        var firstPattern = '^' + req.params.first;
        var lastPattern = '^' + req.params.last;

        data.models.patient.find(
          {
            first:
              {$regex: new RegExp(firstPattern)},
            last:
              {$regex: new RegExp(lastPattern)}
          }).exec(processPatientsLocal);

        function processPatientsLocal(err, patients)
        {
          res.header('Access-Control-Allow-Origin', "*");
          res.patients = patients;
          processPatients(err, res, "Stemming");
        }
      }
    );

    router.get('/jaro_winkler/:first/:last',
      function render(req, res){

        data.models.patient.find().exec(processPatientsLocal);

        function processPatientsLocal(err, patients)
        {
          var filteredPatients = [];

          patients.every(
            function (x)
            {
              var y = x.toJSON();
              y.jwfirst = natural.JaroWinklerDistance(y.first, req.params.first);
              y.jwlast = natural.JaroWinklerDistance(y.last, req.params.last);
              y.jwbar = (y.jwfirst + y.jwlast)/2;
              filteredPatients.push(y);
              return true;
            }
          );

          filteredPatients.sort( sortByJWBar );

          var perfectCount = 0;
          filteredPatients.every(
            function (x)
            {
              var result = x.jwbar==1;
              if(result)perfectCount++;
              return result;
            }
          );

          //inlcude all perfect matches and the top 5 imperfect matches in the result set
          var processedPatients = filteredPatients.slice(0,perfectCount);
          filteredPatients = filteredPatients.slice(perfectCount, filteredPatients.length);
          processedPatients = processedPatients.concat(filteredPatients.slice(0,5));

          res.header('Access-Control-Allow-Origin', "*");
          res.patients = processedPatients;
          processPatients(err, res, "Jaro Winkler");
        }
      }
    );

    function sortByJWBar(a, b)
    {
      return a.jwbar<b.jwbar;
    }

    router.get('/phonetic/:first/:last',
      function render(req, res){

        data.models.patient.find().exec(processPatientsLocal);

        function processPatientsLocal(err, patients)
        {
          var filteredPatients = [];

          patients.every(
            function (x)
            {
              if(
                natural.SoundEx.compare(req.params.first, x.first) &&
                natural.SoundEx.compare(req.params.last, x.last))
              {
                filteredPatients.push(x);
              }
              return true;
            }
          );

          res.patients = filteredPatients;
          processPatients(err, res, "Phonetic");
        }
      }
    );

    function processPatients(err, res, title)
    {
      res.header('Access-Control-Allow-Origin', "*");
      res.json({patients:res.patients});
    }

    // Attach the router.
    data.httpd.use(router);
    next(null, router);
}

// This task depends on `validators`, `models`, and `httpd`
module.exports = [ 'validators', 'models', 'httpd', routes ];
