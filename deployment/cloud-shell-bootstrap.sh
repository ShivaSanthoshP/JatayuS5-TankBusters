#!/usr/bin/env bash
# =============================================================================
# ITOps — AWS Mumbai infrastructure bootstrap
#
# Open AWS CloudShell → top-right region selector → "Asia Pacific (Mumbai)"
# (ap-south-1) → click the terminal icon. Then:
#
#   1. In CloudShell: Actions → Upload file → upload THIS file
#   2. bash cloud-shell-bootstrap.sh
#
# OR just paste the entire file contents directly into the shell.
#
# What this script does (all in ap-south-1 / Mumbai):
#   • Creates an SSH key pair  → ~/itops-mumbai.pem
#   • Creates a security group (SSH from your IP, HTTP world-open)
#   • Looks up the latest Amazon Linux 2023 ARM64 AMI
#   • Launches a t4g.small with encrypted 30 GB gp3 EBS, IMDSv2 required
#   • Allocates + associates an Elastic IP
#   • Creates a $20/month budget alert
#
# Idempotent: re-running is safe — it skips resources that already exist
# (matched by Name tag / group name / key name).
# =============================================================================
set -euo pipefail

# ── Region (Mumbai) ──────────────────────────────────────────────────
export AWS_REGION=ap-south-1
export AWS_DEFAULT_REGION=ap-south-1

# ── Customisable knobs ──────────────────────────────────────────────
APP_NAME="${APP_NAME:-itops-mumbai}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t4g.small}"
VOLUME_GB="${VOLUME_GB:-30}"
KEY_NAME="${KEY_NAME:-itops-mumbai}"
SG_NAME="${SG_NAME:-${APP_NAME}-sg}"
EMAIL_FOR_BUDGET="${EMAIL_FOR_BUDGET:-shivasanthosh0804@gmail.com}"
BUDGET_USD="${BUDGET_USD:-20}"

# Pretty step header
step() { echo; echo "── $1 ────────────────────────────────────────────"; }

# ── 1. Network discovery ────────────────────────────────────────────
step "1. Discovering default VPC + subnet"
VPC_ID=$(aws ec2 describe-vpcs --filters 'Name=is-default,Values=true' \
    --query 'Vpcs[0].VpcId' --output text)
SUBNET_ID=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" \
    --query 'Subnets[0].SubnetId' --output text)
[ "$VPC_ID" = "None" ] && { echo "No default VPC. Create one and retry."; exit 1; }
echo "VPC=$VPC_ID  SUBNET=$SUBNET_ID"

# ── 2. SSH key pair ─────────────────────────────────────────────────
step "2. SSH key pair"
KEY_FILE="$HOME/${KEY_NAME}.pem"
if aws ec2 describe-key-pairs --key-names "$KEY_NAME" >/dev/null 2>&1; then
    echo "Key pair '$KEY_NAME' already exists in AWS."
    if [ ! -f "$KEY_FILE" ]; then
        echo "⚠  Private key file $KEY_FILE is missing in this CloudShell."
        echo "   You can't download it again — delete the key pair from AWS"
        echo "   and re-run, OR use the key file you already saved."
    else
        echo "Private key: $KEY_FILE"
    fi
else
    aws ec2 create-key-pair --key-name "$KEY_NAME" \
        --query 'KeyMaterial' --output text > "$KEY_FILE"
    chmod 400 "$KEY_FILE"
    echo "Created. Private key saved to: $KEY_FILE"
fi

# ── 3. Security group ───────────────────────────────────────────────
step "3. Security group"
MY_IP="$(curl -s https://checkip.amazonaws.com)/32"
SG_ID=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=$SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
    --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || true)
if [ -z "$SG_ID" ] || [ "$SG_ID" = "None" ]; then
    SG_ID=$(aws ec2 create-security-group --group-name "$SG_NAME" \
        --description "ITOps backend SG" --vpc-id "$VPC_ID" \
        --query 'GroupId' --output text)
    echo "Created SG: $SG_ID"
else
    echo "Re-using existing SG: $SG_ID"
fi

# Add rules (idempotent — describe first, only add if missing)
add_rule() {
    local proto=$1 port=$2 cidr=$3
    if ! aws ec2 describe-security-groups --group-ids "$SG_ID" \
            --query "SecurityGroups[0].IpPermissions[?ToPort==\`$port\` && contains(IpRanges[].CidrIp, \`$cidr\`)]" \
            --output text | grep -q .; then
        aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
            --protocol "$proto" --port "$port" --cidr "$cidr" >/dev/null
        echo "  + Added rule: $proto/$port from $cidr"
    else
        echo "  = Rule exists: $proto/$port from $cidr"
    fi
}
add_rule tcp 22 "$MY_IP"
add_rule tcp 80 0.0.0.0/0

# ── 4. AMI lookup ───────────────────────────────────────────────────
step "4. Latest Amazon Linux 2023 ARM64 AMI"
AMI_ID=$(aws ec2 describe-images --owners amazon \
    --filters 'Name=name,Values=al2023-ami-2023.*-arm64' \
              'Name=state,Values=available' \
    --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' --output text)
echo "AMI=$AMI_ID"

# ── 5. EC2 instance ─────────────────────────────────────────────────
step "5. EC2 instance"
INSTANCE_ID=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=$APP_NAME" \
              "Name=instance-state-name,Values=pending,running,stopping,stopped" \
    --query 'Reservations[0].Instances[0].InstanceId' --output text 2>/dev/null || true)
if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
    INSTANCE_ID=$(aws ec2 run-instances \
        --image-id "$AMI_ID" \
        --instance-type "$INSTANCE_TYPE" \
        --key-name "$KEY_NAME" \
        --security-group-ids "$SG_ID" \
        --subnet-id "$SUBNET_ID" \
        --block-device-mappings "[{\"DeviceName\":\"/dev/xvda\",\"Ebs\":{\"VolumeSize\":$VOLUME_GB,\"VolumeType\":\"gp3\",\"Encrypted\":true,\"DeleteOnTermination\":true}}]" \
        --metadata-options 'HttpTokens=required,HttpPutResponseHopLimit=2,HttpEndpoint=enabled' \
        --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$APP_NAME}]" \
        --query 'Instances[0].InstanceId' --output text)
    echo "Launched instance: $INSTANCE_ID"
else
    echo "Re-using existing instance: $INSTANCE_ID"
    # Make sure it's running
    state=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
        --query 'Reservations[0].Instances[0].State.Name' --output text)
    if [ "$state" = "stopped" ]; then
        aws ec2 start-instances --instance-ids "$INSTANCE_ID" >/dev/null
    fi
fi

echo "Waiting for instance to enter 'running' state…"
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"
echo "Instance is running."

# ── 6. Elastic IP ───────────────────────────────────────────────────
step "6. Elastic IP"
# Look for an EIP already associated with this instance
ALLOC_ID=$(aws ec2 describe-addresses \
    --filters "Name=instance-id,Values=$INSTANCE_ID" \
    --query 'Addresses[0].AllocationId' --output text 2>/dev/null || true)
if [ -z "$ALLOC_ID" ] || [ "$ALLOC_ID" = "None" ]; then
    ALLOC_ID=$(aws ec2 allocate-address --domain vpc \
        --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$APP_NAME-eip}]" \
        --query 'AllocationId' --output text)
    aws ec2 associate-address --instance-id "$INSTANCE_ID" --allocation-id "$ALLOC_ID" >/dev/null
    echo "Allocated + attached new EIP."
else
    echo "EIP already attached."
fi
PUBLIC_IP=$(aws ec2 describe-addresses --allocation-ids "$ALLOC_ID" \
    --query 'Addresses[0].PublicIp' --output text)

# ── 7. S3 bucket + IAM role for ChromaDB ───────────────────────────
step "7. S3 bucket + IAM role for ChromaDB (S3 Files)"
CHROMA_BUCKET="${CHROMA_BUCKET:-itops-chromadb-storage}"

# Create bucket (idempotent)
if aws s3api head-bucket --bucket "$CHROMA_BUCKET" 2>/dev/null; then
    echo "Bucket s3://$CHROMA_BUCKET already exists — skipping."
else
    aws s3 mb "s3://$CHROMA_BUCKET" --region "$AWS_REGION"
    echo "Created bucket: s3://$CHROMA_BUCKET"
fi

# IAM role for EC2 → S3 Files access (idempotent)
ROLE_NAME="itops-ec2-role"
PROFILE_NAME="itops-ec2-profile"

if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
    aws iam create-role --role-name "$ROLE_NAME" \
        --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
        --description "ITOps EC2 role for S3 Files / ChromaDB access" > /dev/null
    echo "Created IAM role: $ROLE_NAME"
else
    echo "IAM role $ROLE_NAME already exists — skipping."
fi

aws iam put-role-policy --role-name "$ROLE_NAME" \
    --policy-name "S3ChromaDBAccess" \
    --policy-document "{
      \"Version\":\"2012-10-17\",
      \"Statement\":[{
        \"Effect\":\"Allow\",
        \"Action\":[\"s3:GetObject\",\"s3:PutObject\",\"s3:DeleteObject\",\"s3:ListBucket\"],
        \"Resource\":[
          \"arn:aws:s3:::${CHROMA_BUCKET}\",
          \"arn:aws:s3:::${CHROMA_BUCKET}/*\"
        ]
      }]
    }"
echo "S3 policy attached to role."

if ! aws iam get-instance-profile --instance-profile-name "$PROFILE_NAME" >/dev/null 2>&1; then
    aws iam create-instance-profile --instance-profile-name "$PROFILE_NAME" > /dev/null
    aws iam add-role-to-instance-profile --instance-profile-name "$PROFILE_NAME" --role-name "$ROLE_NAME"
    echo "Created instance profile: $PROFILE_NAME"
else
    echo "Instance profile $PROFILE_NAME already exists — skipping."
fi

# Attach profile to EC2 instance (idempotent)
CURRENT_PROFILE=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].IamInstanceProfile.Arn' --output text 2>/dev/null || true)
if [ -z "$CURRENT_PROFILE" ] || [ "$CURRENT_PROFILE" = "None" ]; then
    aws ec2 associate-iam-instance-profile --instance-id "$INSTANCE_ID" \
        --iam-instance-profile Name="$PROFILE_NAME"
    echo "IAM profile attached to instance $INSTANCE_ID."
else
    echo "Instance already has an IAM profile — skipping association."
fi

# ── 8. Budget alert ─────────────────────────────────────────────────
step "8. Budget alert ($BUDGET_USD/mo at $EMAIL_FOR_BUDGET)"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
if aws budgets describe-budget --account-id "$ACCOUNT_ID" \
        --budget-name "${APP_NAME}-monthly" >/dev/null 2>&1; then
    echo "Budget already exists — skipping."
else
    cat > /tmp/budget.json << EOF
{
  "BudgetName": "${APP_NAME}-monthly",
  "BudgetLimit": {"Amount": "$BUDGET_USD", "Unit": "USD"},
  "TimeUnit": "MONTHLY",
  "BudgetType": "COST"
}
EOF
    cat > /tmp/notifications.json << EOF
[
  {"Notification":{"NotificationType":"ACTUAL","ComparisonOperator":"GREATER_THAN","Threshold":80,"ThresholdType":"PERCENTAGE"},
   "Subscribers":[{"SubscriptionType":"EMAIL","Address":"$EMAIL_FOR_BUDGET"}]},
  {"Notification":{"NotificationType":"FORECASTED","ComparisonOperator":"GREATER_THAN","Threshold":100,"ThresholdType":"PERCENTAGE"},
   "Subscribers":[{"SubscriptionType":"EMAIL","Address":"$EMAIL_FOR_BUDGET"}]}
]
EOF
    aws budgets create-budget --account-id "$ACCOUNT_ID" \
        --budget file:///tmp/budget.json \
        --notifications-with-subscribers file:///tmp/notifications.json
    echo "Budget created. AWS will email $EMAIL_FOR_BUDGET to confirm."
fi

# ── 8. Summary ──────────────────────────────────────────────────────
cat << SUMMARY

============================================================
 ITOPS MUMBAI INFRA — READY
============================================================
  Public IP        : $PUBLIC_IP
  Instance ID      : $INSTANCE_ID
  Security Group   : $SG_ID
  EIP allocation   : $ALLOC_ID
  Key pair name    : $KEY_NAME
  Private key file : $KEY_FILE  ← DOWNLOAD THIS
============================================================

NEXT STEPS (do these on your LAPTOP, not in CloudShell):

  1. In CloudShell window:  Actions → Download file → enter
       $KEY_FILE
     Save it on your laptop, then:
       chmod 400 ~/${KEY_NAME}.pem

  2. SSH in and run the application setup:
       ssh -i ~/${KEY_NAME}.pem ec2-user@${PUBLIC_IP}

     Then on the box:
       sudo dnf install -y git
       git clone https://github.com/<YOUR-USER>/itops.git ~/itops
       bash ~/itops/deployment/setup-ec2.sh
       sudo nano /opt/itops/backend/.env   # set GEMINI_API_KEY, CORS_ALLOW_ORIGINS
       # S3 Files for ChromaDB is mounted automatically by setup-ec2.sh
       # Bucket: s3://$CHROMA_BUCKET  Mount: /mnt/s3/itops

  3. Update GitHub repo secrets (Settings → Secrets → Actions):
       EC2_HOST            = $PUBLIC_IP
       EC2_USER            = ec2-user
       EC2_SSH_PRIVATE_KEY = (paste the contents of ${KEY_NAME}.pem)

  4. Push to main → GitHub Actions deploys.

  5. (Optional) Migrate data from old Sydney box — see
     deployment/README or ask Claude for the steps.

============================================================
SUMMARY

# Save key facts to a file in case the user scrolls
cat > "$HOME/itops-mumbai-info.txt" << EOF
Public IP        : $PUBLIC_IP
Instance ID      : $INSTANCE_ID
Security Group   : $SG_ID
EIP allocation   : $ALLOC_ID
Key pair name    : $KEY_NAME
Private key file : $KEY_FILE
EOF
echo "(Also saved to $HOME/itops-mumbai-info.txt)"
