pipeline {
    agent { label 'windows' }

    options {
        skipDefaultCheckout(true)
        timestamps()
        disableConcurrentBuilds()
    }

    parameters {
        string(name: 'GIT_REPOSITORY', defaultValue: '', description: 'HTTPS or SSH URL for the Sentinel-1 repository')
        string(name: 'GIT_BRANCH', defaultValue: 'main', description: 'Branch to deploy')
        string(name: 'DEPLOY_HOST', defaultValue: 'localhost', description: 'Hostname or IP users will use to reach this deployment')
    }

    environment {
        PYTHON = 'py'
        NODEJS = 'npm'
        BACKEND_PORT = '8000'
        FRONTEND_PORT = '4173'
        APP_DIR = "${WORKSPACE}"
    }

    stages {
        stage('Checkout') {
            steps {
                script {
                    if (!params.GIT_REPOSITORY?.trim()) {
                        error('Set the GIT_REPOSITORY parameter before running this job.')
                    }
                }
                git branch: params.GIT_BRANCH, url: params.GIT_REPOSITORY
            }
        }

        stage('Install dependencies') {
            steps {
                bat "${env.PYTHON} -m pip install --upgrade pip"
                bat "${env.PYTHON} -m pip install -r backend\\requirements.txt"
                bat "cd frontend && ${env.NODEJS} ci"
            }
        }

        stage('Validate') {
            steps {
                bat "${env.PYTHON} -m compileall -q backend"
                withEnv(["VITE_API_URL=http://${params.DEPLOY_HOST}:8000", "VITE_WS_URL=ws://${params.DEPLOY_HOST}:8000/ws"]) {
                    bat "cd frontend && ${env.NODEJS} run build"
                }
            }
        }

        stage('Deploy') {
            steps {
                powershell """
                    New-Item -ItemType Directory -Force -Path "`$env:WORKSPACE\\runtime" | Out-Null
                    Get-NetTCPConnection -LocalPort `$env:BACKEND_PORT,`$env:FRONTEND_PORT -ErrorAction SilentlyContinue |
                        Select-Object -ExpandProperty OwningProcess -Unique |
                        ForEach-Object { Stop-Process -Id `$_ -Force -ErrorAction SilentlyContinue }
                    `$backend = Start-Process -FilePath 'py' -ArgumentList "-m uvicorn main:app --host 0.0.0.0 --port `$env:BACKEND_PORT" -WorkingDirectory "`$env:WORKSPACE\\backend" -RedirectStandardOutput "`$env:WORKSPACE\\runtime\\backend.log" -RedirectStandardError "`$env:WORKSPACE\\runtime\\backend-error.log" -PassThru
                    `$backend.Id | Set-Content "`$env:WORKSPACE\\runtime\\backend.pid"
                    `$frontend = Start-Process -FilePath 'npm.cmd' -ArgumentList "run preview -- --host 0.0.0.0 --port `$env:FRONTEND_PORT" -WorkingDirectory "`$env:WORKSPACE\\frontend" -RedirectStandardOutput "`$env:WORKSPACE\\runtime\\frontend.log" -RedirectStandardError "`$env:WORKSPACE\\runtime\\frontend-error.log" -PassThru
                    `$frontend.Id | Set-Content "`$env:WORKSPACE\\runtime\\frontend.pid"
                """
            }
        }

        stage('Smoke test') {
            steps {
                powershell """
                    `$deadline = (Get-Date).AddSeconds(45)
                    do {
                        try {
                            `$response = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/' -UseBasicParsing -TimeoutSec 3
                            if (`$response.StatusCode -eq 200) { exit 0 }
                        } catch { }
                        Start-Sleep -Seconds 2
                    } while ((Get-Date) -lt `$deadline)
                    throw 'Backend health check failed.'
                """
                powershell """
                    `$response = Invoke-WebRequest -Uri 'http://127.0.0.1:4173/' -UseBasicParsing -TimeoutSec 10
                    if (`$response.StatusCode -ne 200) { throw 'Frontend smoke test failed.' }
                """
            }
        }
    }

    post {
        success {
            echo 'Sentinel-1 is live at http://<jenkins-host>:4173'
        }
        always {
            archiveArtifacts artifacts: 'runtime/*.log', allowEmptyArchive: true
        }
    }
}