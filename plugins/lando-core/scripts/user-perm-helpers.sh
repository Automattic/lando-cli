#!/bin/sh

# Source da helpas
. /helpers/log.sh

# Set the module
LANDO_MODULE="userperms"

# Adding user if needed
add_user() {
  local USER=$1
  local GROUP=$2
  local UID=$3
  local GID=$4
  local DISTRO=$5
  local EXTRAS="$6"
  if [ "$DISTRO" = "alpine" ]; then
    groups | grep "$GROUP" > /dev/null || addgroup -g "$GID" "$GROUP" 2>/dev/null
    id -u "$GROUP" &> /dev/null || adduser -H -D -G "$GROUP" -u "$UID" "$USER" "$GROUP" 2>/dev/null
  else
    groups | grep "$GROUP" > /dev/null || groupadd --force --gid "$GID" "$GROUP" 2>/dev/null
    id -u "$GROUP" &> /dev/null || useradd --gid "$GID" --uid "$UID" $EXTRAS "$USER" 2>/dev/null
  fi;
}

# Verify user
verify_user() {
  local USER=$1
  local GROUP=$2
  local DISTRO=$3
  id -u "$USER" &> /dev/null
  groups | grep "$GROUP" > /dev/null
  if [ "$DISTRO" = "alpine" ]; then
    true
    # is there a chsh we can use? do we need to?
  else
    chsh -s /bin/bash $USER || true
  fi;
}

# Reset user
reset_user() {
  local USER=$1
  local GROUP=$2
  local HOST_UID=$3
  local HOST_GID=$4
  local DISTRO=$5
  local HOST_GROUP=$GROUP
  if getent group "$HOST_GID" 1>/dev/null 2>/dev/null; then
    HOST_GROUP=$(getent group "$HOST_GID" | cut -d: -f1)
  fi
  if [ "$DISTRO" = "alpine" ]; then
    deluser "$USER" 2>/dev/null
    addgroup -g "$HOST_GID" "$GROUP" 2>/dev/null | addgroup "$GROUP" 2>/dev/null
    addgroup -g "$HOST_GID" "$HOST_GROUP" 2>/dev/null
    adduser -u "$HOST_UID" -G "$HOST_GROUP" -h /var/www -D "$USER" 2>/dev/null
    adduser "$USER" "$GROUP" 2>/dev/null
  else
    usermod -o -u "$HOST_UID" "$USER" 2>/dev/null
    groupmod -g "$HOST_GID" "$GROUP" 2>/dev/null || true
    usermod -g "$HOST_GID" "$USER" 2>/dev/null || true
    usermod -a -G "$GROUP" "$USER" 2>/dev/null || true
  fi;
  # If this mapping is incorrect lets abort here
  if [ "$(id -u $USER)" != "$HOST_UID" ]; then
    lando_warn "Looks like host/container user mapping was not possible! aborting..."
    exit 0
  fi
}

# Perm sweeper
# Note that while the order of these things might seem weird and/or redundant
# it is designed to fix more "critical" directories first
perm_sweep() {
  local USER=$1
  local GROUP=$2
  local OTHER_DIR=$3

  # Start with the directories that are likely blockers
  chown -R $USER:$GROUP /usr/local/bin
  chown $USER:$GROUP /var/www
  chown $USER:$GROUP /app
  chmod 755 /var/www

  # Do other dirs first if we have them
  if [ ! -z "$OTHER_DIR" ]; then
    chown -R $USER:$GROUP $OTHER_DIR >/dev/null 2>&1 &
  fi

  # Do a background sweep
  nohup find /app -not -user $USER -execdir chown $USER:$GROUP {} \+ > /tmp/perms.out 2> /tmp/perms.err &
  nohup find /var/www/.ssh -not -user $USER -execdir chown $USER:$GROUP {} \+ > /tmp/perms.out 2> /tmp/perms.err &
  nohup find /user/.ssh -not -user $USER -execdir chown $USER:$GROUP {} \+ > /tmp/perms.out 2> /tmp/perms.err &
  nohup find /var/www -not -user $USER -execdir chown $USER:$GROUP {} \+ > /tmp/perms.out 2> /tmp/perms.err &
  nohup find /usr/local/bin -not -user $USER -execdir chown $USER:$GROUP {} \+ > /tmp/perms.out 2> /tmp/perms.err &
  nohup chmod -R 755 /var/www >/dev/null 2>&1 &

  # Lets also make some /usr/locals chowned
  nohup find /usr/local/lib -not -user $USER -execdir chown $USER:$GROUP {} \+ > /tmp/perms.out 2> /tmp/perms.err &
  nohup find /usr/local/share -not -user $USER -execdir chown $USER:$GROUP {} \+ > /tmp/perms.out 2> /tmp/perms.err &
  nohup find /usr/local -not -user $USER -execdir chown $USER:$GROUP {} \+ > /tmp/perms.out 2> /tmp/perms.err &

  # Make sure we chown the $USER home directory
  nohup find $(getent passwd $USER | cut -d : -f 6) -not -user $USER -execdir chown $USER:$GROUP {} \+ > /tmp/perms.out 2> /tmp/perms.err &
  nohup find /lando -not -user $USER -execdir chown $USER:$GROUP {} \+ > /tmp/perms.out 2> /tmp/perms.err &
}
