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
        var patients = {};

        //chauffeurs
        https.get('https://data.cityofchicago.org/api/views/97wa-y6ff/rows.json?accessType=DOWNLOAD', callback1).on('error', error);

        function callback1(res2)
        {
          console.log('chauffeur data fetched');

          var str1 = '';

          res2.on('data', function(d) {
            str1+=d;
          });

          res2.on('end', function(d) {
            patients.people1 = JSON.parse(str1);

            //public employees
            https.get('https://data.cityofchicago.org/api/views/xzkq-xp2w/rows.json?accessType=DOWNLOAD', callback2).on('error', error);

            function callback2(res3)
            {
              console.log('public employee data fetched');

              var str2 = '';

              res3.on('data', function(d) {
                str2+=d;
              });

              res3.on('end', function(d) {
                patients.people2=JSON.parse(str2);
                recordPatients(data);
              });
            }
          });
        }

        var counter1=0;

        function recordPatients(data)
        {
          console.log('recordPatients');

          //handle chaufeur data
          var PEOPLE1_NAME_INDEX = 15;
          var people1Index;

          var patientsToWrite = [];

          patients.people1.data.every(
            function processPeople1(x)
            {
              var fullName = getFullName(x[PEOPLE1_NAME_INDEX]);

              if(fullName===undefined || fullName===null)
              {
                return true;
              }

              processPeople(fullName);
              return true;
            }
          );

          //handle employee data
          var PEOPLE2_NAME_INDEX = 8;
          var counter2 = 0;

          patients.people2.data.every(
            function processPeople2(x)
            {
              var fullName = getFullName(x[PEOPLE2_NAME_INDEX]);

              if(fullName===undefined || fullName===null)
              {
                return true;
              }

              processPeople(fullName);
              return true;
            }
          );

          function processPeople(fullName)
          {
            var nameParts = fullName.split(' ');

            var fileName = '/Users/fmason/PatientIdentificationUserStudy/patientId/files/' + fullName + '.mp4';

            var Patient = require("../models/patient");

            var patient = new Patient({first:nameParts[0], middle:nameParts.slice(1, nameParts.length-1), last:nameParts[nameParts.length-1], file:fileName});

            patientsToWrite.push(patient);
          }

          var i,j,temparray,chunk = 5000;
          for (i=0,j=patientsToWrite.length; i<j; i+=chunk) {
            temparray = patientsToWrite.slice(i,i+chunk);
            data.models.patient.create(temparray, createCallback);
          }

          function createCallback(error, data)
          {
            if(error)
            {
              console.log('createPatients - error:' + util.inspect(error));
              return;
            }
          }


          String.prototype.trim = function() {
            return this.replace(/^\s+|\s+$/g, "");
          };//native implementation removes internal whitespace

          function getFullName(fullName)
          {

            if(fullName !== null)
            {
              if(fullName.indexOf(',') > -1)
              {
                var nameParts = fullName.split(',');

                nameParts = nameParts.map(function(x){return x.trim();});

                nameParts = [nameParts[nameParts.length-1]].concat(nameParts.slice(0,-1));
                fullName = nameParts.join(' ');
                return fullName;
              }

              return fullName;
            }
          }

          var patientsAdded = 0;

          res.header('Access-Control-Allow-Origin', "*");
          res.json(patients);
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

    router.get('/answers',
      function render(req, res)
      {
        var csv = 'Respondent, Name id, Truth Exists, Response Exists, Intervention, Processing Time\n';

        data.models.answer.find().exec(
          function(err, answers)
          {
            if(err)
            {
              console.log(util.inspect(err));
            }
            else
            {
              answers.every(processAnswer);
            }

            res.send(new Buffer(csv));
          }
        );


        function processAnswer(x)
        {
          csv = csv.concat(x.userId).concat(',')
                  .concat(x.actual).concat(',')
                  .concat(x.present ? 'y':'n').concat(',')
                  .concat(
                    x.observed == 'selected' && x.selected == x.actual ? 'y' :
                    x.observed == 'selected' && x.selected != x.actual ? 'w' :
                    x.observed == 'notPresent' ? 'n' :
                    x.observed == 'clarification' ? 'c':'error').concat(',')
                  .concat(x.mode).concat(',')
                  .concat(x.deltat).concat('\n');
            //need to deal with the case where they made an incorrect identification
          return true;
        }
      });

    router.get('/names',
      function render(req, res)
      {
        var seed = require('../');
        var mt = new Random(Random.engines.mt19937().seed('1024'));
        var patients = [];

        data.models.patient.find().exec(processPatientsLocal);//what to do?

        function processPatientsLocal(err, patientsIn)
        {
          patients = shuffle(patientsIn).slice(0,patientsIn.length>200 ? trialSize+1: trialSize+1);//200

          var patientsCopy = patients.slice(0);
          createMp4Files(patientsCopy);
        }

        function createMp4Files(patientsParam, err)
        {
          if(patientsParam.length === 0)
          {
            res.header('Access-Control-Allow-Origin', "*");
            res.patients = patients;
            processPatients(err, res, "Raw");
            return;
          }

          var patient = patientsParam[0];
          patientsParam = patientsParam.slice(1);

          var fullName = patient.first.concat(' ').concat(patient.last);

          var nameParts = fullName.split(' ');

          var fullNameAnnotated = '';
          nameParts.every(
            function(x)
            {
              fullNameAnnotated = fullNameAnnotated.concat(x.toLowerCase() + ' [[slnc 200]] ');
              return true;
            }
          );

          var exec = require('child_process').exec;

          var command = 'say -r 135 "' + fullNameAnnotated + '" -o ' + '"' + patient.file + '"';

          exec(command,
            function (error, stdout, stderr) {
              // output is in stdout
              if(error !== null && error !== '')console.log("error: " + util.inspect(error));
              if(stdout !==null && stdout !== '')console.log("stdout: " + util.inspect(stdout));
              if(stderr !== null && stderr !== '')console.log("stderr: " + util.inspect(stderr));
              createMp4Files(patientsParam, err);//recurse to next patient
            });
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

        console.log('firstPattern: ' + firstPattern);
        console.log('lastPattern: ' + lastPattern);

        data.models.patient.find(
          {
            first:
              {$regex: new RegExp(firstPattern), $options:'ix'},
            last:
              {$regex: new RegExp(lastPattern), $options:'ix'}
          }).exec(processPatientsLocal);

        function processPatientsLocal(err, processedPatients)
        {
          console.log('stemming returned: ' + processedPatients.length + ' patients');
          res.header('Access-Control-Allow-Origin', "*");
          res.patients = processedPatients;
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
              y.jwfirst = natural.JaroWinklerDistance(y.first.toLowerCase(), req.params.first.toLowerCase());
              y.jwlast = natural.JaroWinklerDistance(y.last.toLowerCase(), req.params.last.toLowerCase());
              y.jwbar = (y.jwfirst + y.jwlast)/2;
              filteredPatients.push(y);

              return true;
            }
          );

          filteredPatients = filteredPatients.sort( sortByJWBar );

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
          processedPatients = processedPatients.concat(filteredPatients.slice(0,6));

          res.header('Access-Control-Allow-Origin', "*");
          res.patients = processedPatients;
          processPatients(err, res, "Jaro Winkler");
        }
      }
    );

    function sortByJWBar(a, b)
    {
      if(a.jwbar<b.jwbar)return 1;
      if(a.jwbar>b.jwbar)return -1;
      if(a.jwbar==b.jwbar)return 0;
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

              var searchForFirstPhonetics = natural.Metaphone.process(req.params.first);
              var searchForLastPhonetics = natural.Metaphone.process(req.params.last);
              var presentFirstPhonetics = natural.Metaphone.process(x.first);
              var presentLastPhonetics = natural.Metaphone.process(x.last);

              //console.log('searchFirst phonetics: ' + searchForFirstPhonetics);
              //console.log('searchLast phonetics: ' + searchForFirstPhonetics);

              var searchFirstRegExp = new RegExp('^' + searchForFirstPhonetics);
              var searchLastRegExp = new RegExp('^' + searchForLastPhonetics);

              if(
                searchFirstRegExp.test(presentFirstPhonetics) &&
                searchLastRegExp.test(presentLastPhonetics))
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
